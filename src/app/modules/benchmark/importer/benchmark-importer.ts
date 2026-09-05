import { createHash } from 'node:crypto';
import {
  HardwareKind,
  ImportRecordStatus,
  ImportStatus,
  Prisma,
  type PrismaClient,
} from '@/app/db/generated/prisma/client';
import { getBenchmarkDefinition } from '../domain/definitions';
import { HardwareResolver } from '../domain/hardware-resolver';
import type {
  CatalogHardware,
  HardwareTarget,
  ValidatedBenchmarkRecord,
} from '../domain/types';
import { validateRawBenchmarkRecord } from '../domain/validation';

export interface ImportSummary {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  unresolved: number;
  rejected: number;
}

export interface BenchmarkImporterOptions {
  dryRun?: boolean;
}

type ApplyResult = 'inserted' | 'updated' | 'skipped';

export function decideScoreWrite(
  existing: {
    score: number;
    sampleCount: number | null;
    sourceUrl: string | null;
    capturedAt: Date;
  } | null,
  incoming: Pick<
    ValidatedBenchmarkRecord,
    'score' | 'sampleCount' | 'sourceUrl' | 'capturedAt'
  >,
): ApplyResult {
  if (!existing) return 'inserted';
  const unchanged =
    existing.score === incoming.score &&
    existing.sampleCount === (incoming.sampleCount ?? null) &&
    existing.sourceUrl === incoming.sourceUrl;
  if (unchanged || new Date(incoming.capturedAt) <= existing.capturedAt) {
    return 'skipped';
  }
  return 'updated';
}

function emptySummary(): ImportSummary {
  return {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    unresolved: 0,
    rejected: 0,
  };
}

function externalId(row: unknown): string {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex');
}

function rawField(row: unknown, key: string): string {
  if (!row || typeof row !== 'object' || !(key in row)) return '';
  return String((row as Record<string, unknown>)[key]);
}

export function sortImportRecords(records: readonly unknown[]): unknown[] {
  return [...records].sort((left, right) => {
    const leftAt = Date.parse(rawField(left, 'capturedAt')) || 0;
    const rightAt = Date.parse(rawField(right, 'capturedAt')) || 0;
    if (leftAt !== rightAt) return leftAt - rightAt;

    // At an equal capture time, process PassMark's canonical clock-qualified
    // row first so malformed bare duplicates cannot replace it.
    const leftClock = /\s@\s*\d+(?:\.\d+)?\s*GHz\b/i.test(
      rawField(left, 'hardwareName'),
    );
    const rightClock = /\s@\s*\d+(?:\.\d+)?\s*GHz\b/i.test(
      rawField(right, 'hardwareName'),
    );
    return Number(rightClock) - Number(leftClock);
  });
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class BenchmarkImporter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: BenchmarkImporterOptions = {},
  ) {}

  async import(records: readonly unknown[]): Promise<ImportSummary> {
    const summary = emptySummary();
    const groups = new Map<string, unknown[]>();
    for (const record of records) {
      const source =
        record && typeof record === 'object' && 'source' in record
          ? String(record.source)
          : 'unknown';
      const group = groups.get(source) ?? [];
      group.push(record);
      groups.set(source, group);
    }

    for (const [source, sourceRecords] of groups) {
      const result = await this.importSource(source, sourceRecords);
      for (const key of Object.keys(summary) as Array<keyof ImportSummary>) {
        summary[key] += result[key];
      }
    }
    return summary;
  }

  private async importSource(
    source: string,
    records: readonly unknown[],
  ): Promise<ImportSummary> {
    const summary = emptySummary();
    const uniqueRecords = sortImportRecords([
      ...new Map(records.map((row) => [externalId(row), row])).values(),
    ]);

    if (this.options.dryRun) {
      const resolvers = await this.loadResolvers();
      for (const raw of uniqueRecords) {
        summary.processed += 1;
        const validation = validateRawBenchmarkRecord(raw);
        if (!validation.value) {
          summary.rejected += 1;
          continue;
        }
        const definition = getBenchmarkDefinition(validation.value.benchmark);
        const resolution = resolvers[definition.target].resolve(
          validation.value.hardwareName,
        );
        if (!resolution.hardware) summary.unresolved += 1;
        else summary.skipped += 1;
      }
      return summary;
    }

    const batch = await this.prisma.importBatch.create({
      data: {
        source,
        kind: 'benchmark',
        status: ImportStatus.RUNNING,
      },
    });

    try {
      const staged = [];
      for (const raw of uniqueRecords) {
        staged.push(
          await this.prisma.importRecord.create({
            data: {
              batchId: batch.id,
              externalId: externalId(raw),
              payload: asJson(raw),
            },
          }),
        );
      }

      const resolvers = await this.loadResolvers();
      for (let index = 0; index < uniqueRecords.length; index += 1) {
        summary.processed += 1;
        const raw = uniqueRecords[index];
        const stagedRecord = staged[index];
        const validation = validateRawBenchmarkRecord(raw);
        if (!validation.value) {
          summary.rejected += 1;
          await this.prisma.importRecord.update({
            where: { id: stagedRecord.id },
            data: {
              status: ImportRecordStatus.FAILED,
              error: validation.error,
              processedAt: new Date(),
            },
          });
          continue;
        }

        const row = validation.value;
        const definition = getBenchmarkDefinition(row.benchmark);
        const resolution = resolvers[definition.target].resolve(
          row.hardwareName,
        );
        if (!resolution.hardware?.id) {
          summary.unresolved += 1;
          await this.prisma.importRecord.update({
            where: { id: stagedRecord.id },
            data: {
              payload: asJson({ raw, normalized: row }),
              status: ImportRecordStatus.NEEDS_REVIEW,
              matchScore: 0,
              error: resolution.reason,
              processedAt: new Date(),
            },
          });
          continue;
        }

        const applied = await this.applyScore(
          definition.target,
          resolution.hardware.id,
          row,
        );
        summary[applied.action] += 1;
        await this.prisma.importRecord.update({
          where: { id: stagedRecord.id },
          data: {
            payload: asJson({ raw, normalized: row }),
            status:
              applied.action === 'skipped'
                ? ImportRecordStatus.SKIPPED
                : ImportRecordStatus.APPLIED,
            targetId: applied.scoreId,
            matchScore: 1,
            processedAt: new Date(),
          },
        });
      }

      const partial = summary.rejected > 0 || summary.unresolved > 0;
      await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: partial ? ImportStatus.PARTIAL : ImportStatus.SUCCEEDED,
          stats: asJson(summary),
          finishedAt: new Date(),
        },
      });
      return summary;
    } catch (error) {
      await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: ImportStatus.FAILED,
          error: error instanceof Error ? error.message : String(error),
          stats: asJson(summary),
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async loadResolvers(): Promise<
    Record<HardwareTarget, HardwareResolver>
  > {
    const [cpus, gpus] = await Promise.all([
      this.prisma.cpu.findMany({
        select: {
          id: true,
          slug: true,
          normalizedName: true,
          name: true,
          aliases: { select: { alias: true } },
        },
      }),
      this.prisma.gpu.findMany({
        select: {
          id: true,
          slug: true,
          normalizedName: true,
          name: true,
          aliases: { select: { alias: true } },
        },
      }),
    ]);
    const toCatalog = (
      target: HardwareTarget,
      rows: typeof cpus,
    ): CatalogHardware[] =>
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        normalizedName: row.normalizedName,
        name: row.name,
        target,
        aliases: row.aliases.map((alias) => alias.alias),
      }));

    return {
      CPU: new HardwareResolver(toCatalog('CPU', cpus), 'CPU'),
      GPU: new HardwareResolver(toCatalog('GPU', gpus), 'GPU'),
    };
  }

  private async applyScore(
    target: HardwareTarget,
    hardwareId: string,
    row: ValidatedBenchmarkRecord,
  ): Promise<{ action: ApplyResult; scoreId: string }> {
    const benchmark = await this.prisma.benchmark.findUnique({
      where: { slug: row.benchmark },
      select: { id: true, target: true },
    });
    if (!benchmark)
      throw new Error(`Benchmark is not seeded: ${row.benchmark}`);
    const expectedTarget =
      target === 'CPU' ? HardwareKind.CPU : HardwareKind.GPU;
    if (benchmark.target !== expectedTarget) {
      throw new Error(`Benchmark target mismatch: ${row.benchmark}`);
    }

    const key = {
      benchmarkId: benchmark.id,
      source: row.source,
    };
    const existing =
      target === 'CPU'
        ? await this.prisma.cpuBenchmarkScore.findUnique({
            where: {
              cpuId_benchmarkId_source: { cpuId: hardwareId, ...key },
            },
          })
        : await this.prisma.gpuBenchmarkScore.findUnique({
            where: {
              gpuId_benchmarkId_source: { gpuId: hardwareId, ...key },
            },
          });

    const decision = decideScoreWrite(existing, row);
    if (existing) {
      if (decision === 'skipped') {
        return { action: decision, scoreId: existing.id };
      }
      const incomingAt = new Date(row.capturedAt);

      const data = {
        score: row.score,
        sampleCount: row.sampleCount,
        sourceUrl: row.sourceUrl,
        capturedAt: incomingAt,
      };
      if (target === 'CPU') {
        await this.prisma.cpuBenchmarkScore.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.gpuBenchmarkScore.update({
          where: { id: existing.id },
          data,
        });
      }
      return { action: decision, scoreId: existing.id };
    }

    const data = {
      benchmarkId: benchmark.id,
      score: row.score,
      sampleCount: row.sampleCount,
      source: row.source,
      sourceUrl: row.sourceUrl,
      capturedAt: new Date(row.capturedAt),
    };
    let scoreId: string;
    if (target === 'CPU') {
      const created = await this.prisma.cpuBenchmarkScore.create({
        data: { ...data, cpuId: hardwareId },
      });
      scoreId = created.id;
    } else {
      const created = await this.prisma.gpuBenchmarkScore.create({
        data: { ...data, gpuId: hardwareId },
      });
      scoreId = created.id;
    }
    return { action: decision, scoreId };
  }
}
