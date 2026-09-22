import { createHash } from 'node:crypto';
import {
  FormFactor,
  ImportRecordStatus,
  ImportStatus,
  Prisma,
  Upscaler,
  type PrismaClient,
} from '@/app/db/generated/prisma/client';
import { normalizeHardwareName } from '@/app/common/hardware/normalize-hardware-name';
import { HardwareResolver } from '@/app/modules/benchmark/domain/hardware-resolver';
import type { CatalogHardware } from '@/app/modules/benchmark/domain/types';
import { normalizeNotebookcheckGpuName } from './notebookcheck/normalize-gpu-name';
import type {
  MissingFpsRecord,
  RawFpsSampleRecord,
  TopHardwareSelection,
} from './types';

export const DEFAULT_TOP_GPU_LIMIT = 100;

export interface FpsImportSummary {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  unresolvedGpu: number;
  unresolvedGame: number;
  outsideTop60: number;
  rejected: number;
}

export interface FpsImporterOptions {
  dryRun?: boolean;
  topGpuLimit?: number;
}

function emptySummary(): FpsImportSummary {
  return {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    unresolvedGpu: 0,
    unresolvedGame: 0,
    outsideTop60: 0,
    rejected: 0,
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function fpsDedupeKey(input: {
  gameId: string;
  gpuId: string;
  cpuId: string;
  resolution: string;
  preset: string;
  upscaler: string;
  rayTracing: boolean;
  frameGen: boolean;
  source: string;
  sourceUrl: string;
}): string {
  return createHash('sha256')
    .update(
      [
        input.gameId,
        input.gpuId,
        input.cpuId,
        input.resolution,
        input.preset,
        input.upscaler,
        String(input.rayTracing),
        String(input.frameGen),
        input.source,
        input.sourceUrl,
      ].join('|'),
    )
    .digest('hex');
}

export function isRawFpsSampleRecord(value: unknown): value is RawFpsSampleRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.source === 'notebookcheck' &&
    typeof row.gameSlug === 'string' &&
    typeof row.gpuName === 'string' &&
    typeof row.avgFps === 'number' &&
    typeof row.resolution === 'string' &&
    typeof row.preset === 'string' &&
    typeof row.sourceUrl === 'string'
  );
}

export async function selectTopHardware(
  prisma: PrismaClient,
  topGpuLimit = DEFAULT_TOP_GPU_LIMIT,
): Promise<TopHardwareSelection> {
  const gpus = await prisma.gpu.findMany({
    where: {
      formFactor: FormFactor.DESKTOP,
      gamingIndex: { not: null },
    },
    orderBy: { gamingIndex: 'desc' },
    take: topGpuLimit,
    select: {
      id: true,
      slug: true,
      name: true,
      gamingIndex: true,
    },
  });
  const cpu = await prisma.cpu.findFirst({
    where: {
      formFactor: FormFactor.DESKTOP,
      gamingIndex: { not: null },
    },
    orderBy: { gamingIndex: 'desc' },
    select: {
      id: true,
      slug: true,
      name: true,
      gamingIndex: true,
    },
  });
  if (gpus.length === 0) {
    throw new Error('No desktop GPUs with gamingIndex found. Run index:hardware first.');
  }
  if (!cpu || cpu.gamingIndex == null) {
    throw new Error('No desktop CPU with gamingIndex found. Run index:hardware first.');
  }
  return {
    gpus: gpus.map((gpu) => ({
      id: gpu.id,
      slug: gpu.slug,
      name: gpu.name,
      gamingIndex: gpu.gamingIndex!,
    })),
    cpu: {
      id: cpu.id,
      slug: cpu.slug,
      name: cpu.name,
      gamingIndex: cpu.gamingIndex,
    },
  };
}

export class FpsImporter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: FpsImporterOptions = {},
  ) {}

  async import(records: readonly unknown[]): Promise<{
    summary: FpsImportSummary;
    missed: MissingFpsRecord[];
  }> {
    const summary = emptySummary();
    const missed: MissingFpsRecord[] = [];
    const now = new Date().toISOString();
    const top = await selectTopHardware(
      this.prisma,
      this.options.topGpuLimit ?? DEFAULT_TOP_GPU_LIMIT,
    );
    const topGpuIds = new Set(top.gpus.map((gpu) => gpu.id));

    const gpuCatalog: CatalogHardware[] = (
      await this.prisma.gpu.findMany({
        where: { formFactor: FormFactor.DESKTOP },
        select: {
          id: true,
          slug: true,
          name: true,
          normalizedName: true,
          vramGb: true,
          gamingIndex: true,
          aliases: { select: { alias: true } },
        },
      })
    ).map((gpu) => ({
      id: gpu.id,
      slug: gpu.slug,
      name: gpu.name,
      normalizedName: gpu.normalizedName,
      target: 'GPU' as const,
      aliases: gpu.aliases.map((alias) => alias.alias),
      // Prefer higher VRAM when NBC omits capacity (e.g. RTX 3060 → 12 GB).
      preferenceRank: gpu.vramGb == null ? null : -gpu.vramGb,
      gamingIndex: gpu.gamingIndex,
    }));
    const resolver = new HardwareResolver(gpuCatalog, 'GPU');

    const games = await this.prisma.game.findMany({
      select: { id: true, slug: true, name: true },
    });
    const gamesBySlug = new Map(games.map((game) => [game.slug, game]));

    const valid = records.filter(isRawFpsSampleRecord);
    summary.rejected += records.length - valid.length;

    let batchId: string | null = null;
    if (!this.options.dryRun) {
      const batch = await this.prisma.importBatch.create({
        data: {
          source: 'notebookcheck',
          kind: 'fps',
          status: ImportStatus.RUNNING,
        },
      });
      batchId = batch.id;
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of valid) {
      summary.processed += 1;
      const game = gamesBySlug.get(row.gameSlug);
      if (!game) {
        summary.unresolvedGame += 1;
        missed.push({
          source: 'notebookcheck',
          reason: 'game-unresolved',
          gameSlug: row.gameSlug,
          detail: `No Game.slug=${row.gameSlug}`,
          checkedAt: now,
        });
        continue;
      }

      const gpuName = normalizeNotebookcheckGpuName(row.gpuName);
      const resolved = resolver.resolve(gpuName);
      if (!resolved.hardware?.id) {
        summary.unresolvedGpu += 1;
        missed.push({
          source: 'notebookcheck',
          reason: 'gpu-unresolved',
          gameSlug: row.gameSlug,
          gpuName: row.gpuName,
          detail: resolved.reason,
          checkedAt: now,
        });
        continue;
      }

      if (!topGpuIds.has(resolved.hardware.id)) {
        summary.outsideTop60 += 1;
        missed.push({
          source: 'notebookcheck',
          reason: 'gpu-not-in-top60',
          gameSlug: row.gameSlug,
          gpuName: row.gpuName,
          detail: `matched ${resolved.hardware.slug} outside top ${top.gpus.length}`,
          checkedAt: now,
        });
        continue;
      }

      if (!Number.isFinite(row.avgFps) || row.avgFps <= 0) {
        summary.rejected += 1;
        missed.push({
          source: 'notebookcheck',
          reason: 'invalid-fps',
          gameSlug: row.gameSlug,
          gpuName: row.gpuName,
          checkedAt: now,
        });
        continue;
      }

      const dedupeKey = fpsDedupeKey({
        gameId: game.id,
        gpuId: resolved.hardware.id,
        cpuId: top.cpu.id,
        resolution: row.resolution,
        preset: row.preset,
        upscaler: Upscaler.NONE,
        rayTracing: false,
        frameGen: false,
        source: row.source,
        sourceUrl: row.sourceUrl,
      });

      const externalId = createHash('sha256')
        .update(
          [
            row.gameSlug,
            normalizeHardwareName(row.gpuName),
            row.resolution,
            row.preset,
            row.sourceUrl,
            String(row.avgFps),
          ].join('|'),
        )
        .digest('hex');

      if (this.options.dryRun) {
        const existing = await this.prisma.fpsSample.findUnique({
          where: { dedupeKey },
          select: { avgFps: true },
        });
        if (!existing) inserted += 1;
        else if (existing.avgFps !== row.avgFps) updated += 1;
        else skipped += 1;
        continue;
      }

      if (!batchId) throw new Error('Import batch missing');

      await this.prisma.importRecord.create({
        data: {
          batchId,
          externalId,
          payload: asJson(row),
          status: ImportRecordStatus.PENDING,
        },
      });

      const existing = await this.prisma.fpsSample.findUnique({
        where: { dedupeKey },
        select: { id: true, avgFps: true },
      });

      const data = {
        gameId: game.id,
        gpuId: resolved.hardware.id,
        cpuId: top.cpu.id,
        resolution: row.resolution,
        preset: row.preset,
        upscaler: Upscaler.NONE,
        rayTracing: false,
        frameGen: false,
        avgFps: row.avgFps,
        source: row.source,
        sourceUrl: row.sourceUrl,
        confidence: row.confidence,
        capturedAt: new Date(row.capturedAt),
        dedupeKey,
      };

      if (!existing) {
        const created = await this.prisma.fpsSample.create({ data });
        await this.prisma.importRecord.update({
          where: { batchId_externalId: { batchId, externalId } },
          data: {
            status: ImportRecordStatus.APPLIED,
            targetId: created.id,
            matchScore: 1,
            processedAt: new Date(),
          },
        });
        inserted += 1;
      } else if (existing.avgFps !== row.avgFps) {
        await this.prisma.fpsSample.update({
          where: { id: existing.id },
          data: {
            avgFps: row.avgFps,
            confidence: row.confidence,
            sourceUrl: row.sourceUrl,
            capturedAt: new Date(row.capturedAt),
          },
        });
        await this.prisma.importRecord.update({
          where: { batchId_externalId: { batchId, externalId } },
          data: {
            status: ImportRecordStatus.APPLIED,
            targetId: existing.id,
            matchScore: 1,
            processedAt: new Date(),
          },
        });
        updated += 1;
      } else {
        await this.prisma.importRecord.update({
          where: { batchId_externalId: { batchId, externalId } },
          data: {
            status: ImportRecordStatus.SKIPPED,
            targetId: existing.id,
            processedAt: new Date(),
          },
        });
        skipped += 1;
      }
    }

    summary.inserted = inserted;
    summary.updated = updated;
    summary.skipped = skipped;

    if (batchId && !this.options.dryRun) {
      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status: ImportStatus.SUCCEEDED,
          finishedAt: new Date(),
          stats: {
            ...summary,
            topCpu: top.cpu.slug,
            topGpuCount: top.gpus.length,
          },
        },
      });
    }

    return { summary, missed };
  }
}
