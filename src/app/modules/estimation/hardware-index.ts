/**
 * Pure hardware index math (no Prisma).
 *
 * Formula from document/estimation.md:
 *   n(h,b) = score / maxScore(b)
 *   raw(h) = Σ w·n / Σ w   (only benchmarks this part has)
 *   index  = 100 · raw / max(raw)
 *
 * CPU gamingIndex blends category raws: 0.65 single + 0.35 multi.
 */

export interface IndexBenchmark {
  id: string;
  slug: string;
  category: string | null;
  weightInIndex: number;
  isActive: boolean;
}

export interface IndexScoreRow {
  hardwareId: string;
  benchmarkId: string;
  score: number;
  sampleCount: number | null;
  capturedAt: Date | string;
}

export interface HardwareIndexUpdate {
  hardwareId: string;
  gamingIndex: number | null;
  singleThreadIndex: number | null;
  multiThreadIndex: number | null;
}

export const CPU_SINGLE_CATEGORY = 'cpu-single';
export const CPU_MULTI_CATEGORY = 'cpu-multi';
export const GPU_GAMING_CATEGORY = 'gpu-gaming';

/** Gaming blend before final catalogue rescale. */
export const CPU_GAMING_SINGLE_WEIGHT = 0.65;
export const CPU_GAMING_MULTI_WEIGHT = 0.35;

function roundIndex(value: number): number {
  return Math.round(value * 100) / 100;
}

function capturedAtMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value) || 0;
}

/** One score per (hardware, benchmark): prefer more samples, then newer. */
export function reduceScoresByHardwareBenchmark(
  scores: readonly IndexScoreRow[],
): Map<string, IndexScoreRow> {
  const best = new Map<string, IndexScoreRow>();
  for (const row of scores) {
    if (!(row.score > 0)) continue;
    const key = `${row.hardwareId}:${row.benchmarkId}`;
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      continue;
    }
    const currentSamples = current.sampleCount ?? 0;
    const nextSamples = row.sampleCount ?? 0;
    if (nextSamples > currentSamples) {
      best.set(key, row);
      continue;
    }
    if (
      nextSamples === currentSamples &&
      capturedAtMs(row.capturedAt) > capturedAtMs(current.capturedAt)
    ) {
      best.set(key, row);
    }
  }
  return best;
}

export function activeWeightedBenchmarks(
  benchmarks: readonly IndexBenchmark[],
  category?: string,
): IndexBenchmark[] {
  return benchmarks.filter(
    (benchmark) =>
      benchmark.isActive &&
      benchmark.weightInIndex > 0 &&
      (category == null || benchmark.category === category),
  );
}

/**
 * Weighted raw in [0, 1+] for each hardware that has at least one score
 * among the given benchmarks. Missing suites are omitted and weights
 * renormalize per hardware.
 */
export function computeWeightedRaws(
  hardwareIds: readonly string[],
  scores: readonly IndexScoreRow[],
  benchmarks: readonly IndexBenchmark[],
): Map<string, number> {
  const suite = activeWeightedBenchmarks(benchmarks);
  if (suite.length === 0) return new Map();

  const best = reduceScoresByHardwareBenchmark(scores);
  const maxByBenchmark = new Map<string, number>();
  for (const benchmark of suite) {
    let max = 0;
    for (const hardwareId of hardwareIds) {
      const row = best.get(`${hardwareId}:${benchmark.id}`);
      if (row && row.score > max) max = row.score;
    }
    maxByBenchmark.set(benchmark.id, max);
  }

  const raws = new Map<string, number>();
  for (const hardwareId of hardwareIds) {
    let weighted = 0;
    let weightSum = 0;
    for (const benchmark of suite) {
      const max = maxByBenchmark.get(benchmark.id) ?? 0;
      if (!(max > 0)) continue;
      const row = best.get(`${hardwareId}:${benchmark.id}`);
      if (!row) continue;
      weighted += benchmark.weightInIndex * (row.score / max);
      weightSum += benchmark.weightInIndex;
    }
    if (weightSum > 0) raws.set(hardwareId, weighted / weightSum);
  }
  return raws;
}

/** Scale raws so the strongest part is exactly 100. */
export function scaleRawsToIndex(
  raws: ReadonlyMap<string, number>,
): Map<string, number> {
  let maxRaw = 0;
  for (const raw of raws.values()) {
    if (raw > maxRaw) maxRaw = raw;
  }
  const scaled = new Map<string, number>();
  if (!(maxRaw > 0)) return scaled;
  for (const [hardwareId, raw] of raws) {
    scaled.set(hardwareId, roundIndex((100 * raw) / maxRaw));
  }
  return scaled;
}

function blendCpuGamingRaws(
  singleRaws: ReadonlyMap<string, number>,
  multiRaws: ReadonlyMap<string, number>,
  hardwareIds: readonly string[],
): Map<string, number> {
  const blended = new Map<string, number>();
  for (const hardwareId of hardwareIds) {
    const single = singleRaws.get(hardwareId);
    const multi = multiRaws.get(hardwareId);
    let weighted = 0;
    let weightSum = 0;
    if (single != null) {
      weighted += CPU_GAMING_SINGLE_WEIGHT * single;
      weightSum += CPU_GAMING_SINGLE_WEIGHT;
    }
    if (multi != null) {
      weighted += CPU_GAMING_MULTI_WEIGHT * multi;
      weightSum += CPU_GAMING_MULTI_WEIGHT;
    }
    if (weightSum > 0) blended.set(hardwareId, weighted / weightSum);
  }
  return blended;
}

export function computeCpuHardwareIndexes(
  hardwareIds: readonly string[],
  scores: readonly IndexScoreRow[],
  benchmarks: readonly IndexBenchmark[],
): HardwareIndexUpdate[] {
  const singleRaws = computeWeightedRaws(
    hardwareIds,
    scores,
    activeWeightedBenchmarks(benchmarks, CPU_SINGLE_CATEGORY),
  );
  const multiRaws = computeWeightedRaws(
    hardwareIds,
    scores,
    activeWeightedBenchmarks(benchmarks, CPU_MULTI_CATEGORY),
  );
  const singleIndex = scaleRawsToIndex(singleRaws);
  const multiIndex = scaleRawsToIndex(multiRaws);
  const gamingIndex = scaleRawsToIndex(
    blendCpuGamingRaws(singleRaws, multiRaws, hardwareIds),
  );

  return hardwareIds.map((hardwareId) => ({
    hardwareId,
    gamingIndex: gamingIndex.get(hardwareId) ?? null,
    singleThreadIndex: singleIndex.get(hardwareId) ?? null,
    multiThreadIndex: multiIndex.get(hardwareId) ?? null,
  }));
}

export function computeGpuHardwareIndexes(
  hardwareIds: readonly string[],
  scores: readonly IndexScoreRow[],
  benchmarks: readonly IndexBenchmark[],
): HardwareIndexUpdate[] {
  const gamingRaws = computeWeightedRaws(
    hardwareIds,
    scores,
    activeWeightedBenchmarks(benchmarks, GPU_GAMING_CATEGORY),
  );
  const gamingIndex = scaleRawsToIndex(gamingRaws);
  return hardwareIds.map((hardwareId) => ({
    hardwareId,
    gamingIndex: gamingIndex.get(hardwareId) ?? null,
    singleThreadIndex: null,
    multiThreadIndex: null,
  }));
}
