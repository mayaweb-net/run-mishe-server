import type {
  DemandTier,
  Prisma,
  PrismaClient,
  QualityPreset,
  ScreenResolution,
  Upscaler,
} from '@/app/db/generated/prisma/client';
import {
  COLD_RAM_NEED_GB,
  COLD_VRAM_NEED_GB,
  type DemandTier as EstDemandTier,
} from './estimation.constants';
import {
  CALIBRATION_VERSION,
  calibrateGame,
  scalingKey,
  type CalibrationSample,
  type CalibrateGameResult,
  type ScalingTable,
} from './calibration';

export interface CalibrationGameOutcome {
  gameId: string;
  slug: string;
  name: string;
  sampleCount: number;
  status: CalibrateGameResult['status'];
  reason?: string;
  holdoutMape: number | null;
  coldStartMape: number | null;
  rSquared: number | null;
  scalingRows: number;
}

export interface CalibrationJobSummary {
  totalGames: number;
  calibrated: number;
  skipped: number;
  rejected: number;
  outcomes: CalibrationGameOutcome[];
  calibrationVersion: number;
  dryRun: boolean;
}

function asVramJson(tier: DemandTier): Prisma.InputJsonValue {
  return COLD_VRAM_NEED_GB[tier as EstDemandTier] as unknown as Prisma.InputJsonValue;
}

function buildDefaultScalingTable(
  rows: Array<{
    resolution: ScreenResolution;
    preset: QualityPreset;
    upscaler: Upscaler;
    rayTracing: boolean;
    multiplier: number;
  }>,
): ScalingTable {
  const table: ScalingTable = new Map();
  for (const row of rows) {
    table.set(
      scalingKey(row.resolution, row.preset, row.upscaler, row.rayTracing),
      row.multiplier,
    );
  }
  return table;
}

async function persistCalibration(
  prisma: PrismaClient,
  gameId: string,
  demandTier: DemandTier,
  result: CalibrateGameResult,
): Promise<void> {
  if (result.status !== 'calibrated' || !result.profile) return;
  const profile = result.profile;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.gameProfile.upsert({
      where: { gameId },
      create: {
        gameId,
        gpuCoef: profile.gpuCoef,
        gpuExponent: profile.gpuExponent,
        cpuCoef: profile.cpuCoef,
        cpuExponent: profile.cpuExponent,
        blendK: profile.blendK,
        vramNeedGb: asVramJson(demandTier),
        ramNeedGb: COLD_RAM_NEED_GB[demandTier as EstDemandTier],
        sampleCount: profile.sampleCount,
        rSquared: profile.rSquared,
        isCalibrated: true,
        calibratedAt: now,
        calibrationVersion: CALIBRATION_VERSION,
      },
      update: {
        gpuCoef: profile.gpuCoef,
        gpuExponent: profile.gpuExponent,
        cpuCoef: profile.cpuCoef,
        cpuExponent: profile.cpuExponent,
        blendK: profile.blendK,
        vramNeedGb: asVramJson(demandTier),
        ramNeedGb: COLD_RAM_NEED_GB[demandTier as EstDemandTier],
        sampleCount: profile.sampleCount,
        rSquared: profile.rSquared,
        isCalibrated: true,
        calibratedAt: now,
        calibrationVersion: CALIBRATION_VERSION,
      },
    });

    for (const row of result.scalings) {
      await tx.gameScaling.upsert({
        where: {
          gameId_resolution_preset_upscaler_rayTracing: {
            gameId,
            resolution: row.resolution,
            preset: row.preset,
            upscaler: row.upscaler,
            rayTracing: row.rayTracing,
          },
        },
        create: {
          gameId,
          resolution: row.resolution,
          preset: row.preset,
          upscaler: row.upscaler,
          rayTracing: row.rayTracing,
          multiplier: row.multiplier,
          sampleCount: row.sampleCount,
        },
        update: {
          multiplier: row.multiplier,
          sampleCount: row.sampleCount,
        },
      });
    }
  });
}

export async function runCalibrationJob(
  prisma: PrismaClient,
  options: { dryRun?: boolean; gameSlug?: string } = {},
): Promise<CalibrationJobSummary> {
  const dryRun = options.dryRun === true;

  const defaultRows = await prisma.defaultScaling.findMany({
    select: {
      resolution: true,
      preset: true,
      upscaler: true,
      rayTracing: true,
      multiplier: true,
    },
  });
  if (defaultRows.length === 0) {
    throw new Error('No DefaultScaling rows — run prisma db seed first.');
  }
  const defaultScaling = buildDefaultScalingTable(defaultRows);

  const games = await prisma.game.findMany({
    where: options.gameSlug ? { slug: options.gameSlug } : undefined,
    select: {
      id: true,
      slug: true,
      name: true,
      demandTier: true,
    },
    orderBy: { slug: 'asc' },
  });

  const outcomes: CalibrationGameOutcome[] = [];
  let calibrated = 0;
  let skipped = 0;
  let rejected = 0;

  for (const game of games) {
    const rows = await prisma.fpsSample.findMany({
      where: { gameId: game.id },
      select: {
        avgFps: true,
        confidence: true,
        resolution: true,
        preset: true,
        upscaler: true,
        rayTracing: true,
        gpuId: true,
        cpuId: true,
        gpu: { select: { gamingIndex: true } },
        cpu: { select: { gamingIndex: true } },
      },
    });

    const samples: CalibrationSample[] = [];
    for (const row of rows) {
      const gpuIndex = row.gpu.gamingIndex;
      const cpuIndex = row.cpu.gamingIndex;
      if (gpuIndex == null || cpuIndex == null) continue;
      if (!(row.avgFps > 0)) continue;
      samples.push({
        gpuId: row.gpuId,
        cpuId: row.cpuId,
        gpuIndex,
        cpuIndex,
        avgFps: row.avgFps,
        confidence: row.confidence,
        resolution: row.resolution,
        preset: row.preset,
        upscaler: row.upscaler,
        rayTracing: row.rayTracing,
      });
    }

    if (samples.length === 0) {
      skipped += 1;
      outcomes.push({
        gameId: game.id,
        slug: game.slug,
        name: game.name,
        sampleCount: 0,
        status: 'skipped',
        reason: 'no samples',
        holdoutMape: null,
        coldStartMape: null,
        rSquared: null,
        scalingRows: 0,
      });
      continue;
    }

    const result = calibrateGame({
      samples,
      defaultScaling,
      demandTier: game.demandTier,
    });

    if (result.status === 'calibrated') {
      calibrated += 1;
      if (!dryRun) {
        await persistCalibration(prisma, game.id, game.demandTier, result);
      }
    } else if (result.status === 'rejected') {
      rejected += 1;
    } else {
      skipped += 1;
    }

    outcomes.push({
      gameId: game.id,
      slug: game.slug,
      name: game.name,
      sampleCount: samples.length,
      status: result.status,
      reason: result.reason,
      holdoutMape: result.holdoutMape,
      coldStartMape: result.coldStartMape,
      rSquared: result.profile?.rSquared ?? null,
      scalingRows: result.scalings.length,
    });
  }

  return {
    totalGames: games.length,
    calibrated,
    skipped,
    rejected,
    outcomes,
    calibrationVersion: CALIBRATION_VERSION,
    dryRun,
  };
}
