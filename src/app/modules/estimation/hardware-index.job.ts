import type { PrismaClient } from '@/app/db/generated/prisma/client';
import {
  computeCpuHardwareIndexes,
  computeGpuHardwareIndexes,
  type IndexBenchmark,
  type IndexScoreRow,
} from './hardware-index';

export interface HardwareIndexJobSummary {
  cpusUpdated: number;
  cpusCleared: number;
  gpusUpdated: number;
  gpusCleared: number;
  calculatedAt: string;
}

function toScoreRows(
  rows: Array<{
    hardwareId: string;
    benchmarkId: string;
    score: number;
    sampleCount: number | null;
    capturedAt: Date;
  }>,
): IndexScoreRow[] {
  return rows;
}

export async function runHardwareIndexJob(
  prisma: PrismaClient,
): Promise<HardwareIndexJobSummary> {
  const calculatedAt = new Date();
  const benchmarks = (await prisma.benchmark.findMany({
    select: {
      id: true,
      slug: true,
      category: true,
      weightInIndex: true,
      isActive: true,
    },
  })) as IndexBenchmark[];

  const [cpus, gpus, cpuScores, gpuScores] = await Promise.all([
    prisma.cpu.findMany({ select: { id: true } }),
    prisma.gpu.findMany({ select: { id: true } }),
    prisma.cpuBenchmarkScore.findMany({
      select: {
        cpuId: true,
        benchmarkId: true,
        score: true,
        sampleCount: true,
        capturedAt: true,
      },
    }),
    prisma.gpuBenchmarkScore.findMany({
      select: {
        gpuId: true,
        benchmarkId: true,
        score: true,
        sampleCount: true,
        capturedAt: true,
      },
    }),
  ]);

  const cpuUpdates = computeCpuHardwareIndexes(
    cpus.map((row) => row.id),
    toScoreRows(
      cpuScores.map((row) => ({
        hardwareId: row.cpuId,
        benchmarkId: row.benchmarkId,
        score: row.score,
        sampleCount: row.sampleCount,
        capturedAt: row.capturedAt,
      })),
    ),
    benchmarks,
  );
  const gpuUpdates = computeGpuHardwareIndexes(
    gpus.map((row) => row.id),
    toScoreRows(
      gpuScores.map((row) => ({
        hardwareId: row.gpuId,
        benchmarkId: row.benchmarkId,
        score: row.score,
        sampleCount: row.sampleCount,
        capturedAt: row.capturedAt,
      })),
    ),
    benchmarks,
  );

  let cpusUpdated = 0;
  let cpusCleared = 0;
  for (const update of cpuUpdates) {
    await prisma.cpu.update({
      where: { id: update.hardwareId },
      data: {
        gamingIndex: update.gamingIndex,
        singleThreadIndex: update.singleThreadIndex,
        multiThreadIndex: update.multiThreadIndex,
        indexCalculatedAt: update.gamingIndex == null ? null : calculatedAt,
      },
    });
    if (update.gamingIndex == null) cpusCleared += 1;
    else cpusUpdated += 1;
  }

  let gpusUpdated = 0;
  let gpusCleared = 0;
  for (const update of gpuUpdates) {
    await prisma.gpu.update({
      where: { id: update.hardwareId },
      data: {
        gamingIndex: update.gamingIndex,
        indexCalculatedAt: update.gamingIndex == null ? null : calculatedAt,
      },
    });
    if (update.gamingIndex == null) gpusCleared += 1;
    else gpusUpdated += 1;
  }

  return {
    cpusUpdated,
    cpusCleared,
    gpusUpdated,
    gpusCleared,
    calculatedAt: calculatedAt.toISOString(),
  };
}
