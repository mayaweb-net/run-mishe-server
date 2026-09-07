import { describe, expect, it } from 'vitest';
import {
  CPU_GAMING_MULTI_WEIGHT,
  CPU_GAMING_SINGLE_WEIGHT,
  computeCpuHardwareIndexes,
  computeGpuHardwareIndexes,
  computeWeightedRaws,
  reduceScoresByHardwareBenchmark,
  scaleRawsToIndex,
  type IndexBenchmark,
  type IndexScoreRow,
} from './hardware-index';

const single: IndexBenchmark = {
  id: 'b-single',
  slug: 'passmark-single-thread',
  category: 'cpu-single',
  weightInIndex: 0.7,
  isActive: true,
};
const multi: IndexBenchmark = {
  id: 'b-multi',
  slug: 'passmark-cpu-mark',
  category: 'cpu-multi',
  weightInIndex: 0.65,
  isActive: true,
};
const g3d: IndexBenchmark = {
  id: 'b-g3d',
  slug: 'passmark-g3d-mark',
  category: 'gpu-gaming',
  weightInIndex: 0.3,
  isActive: true,
};
const ark: IndexBenchmark = {
  id: 'b-ark',
  slug: 'gpuark-gpi',
  category: 'gpu-gaming',
  weightInIndex: 0.7,
  isActive: true,
};

function score(
  hardwareId: string,
  benchmarkId: string,
  value: number,
  sampleCount: number | null = 10,
): IndexScoreRow {
  return {
    hardwareId,
    benchmarkId,
    score: value,
    sampleCount,
    capturedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
}

describe('reduceScoresByHardwareBenchmark', () => {
  it('keeps the row with more samples', () => {
    const best = reduceScoresByHardwareBenchmark([
      score('cpu-a', 'b-multi', 1000, 5),
      score('cpu-a', 'b-multi', 1100, 50),
    ]);
    expect(best.get('cpu-a:b-multi')?.score).toBe(1100);
  });
});

describe('GPU hardware index', () => {
  it('puts the strongest catalogue GPU at 100 and scales peers', () => {
    const updates = computeGpuHardwareIndexes(
      ['gpu-fast', 'gpu-mid'],
      [
        score('gpu-fast', 'b-g3d', 30000),
        score('gpu-mid', 'b-g3d', 15000),
        score('gpu-fast', 'b-ark', 44),
        score('gpu-mid', 'b-ark', 22),
      ],
      [g3d, ark],
    );
    const byId = new Map(updates.map((row) => [row.hardwareId, row]));
    expect(byId.get('gpu-fast')?.gamingIndex).toBe(100);
    expect(byId.get('gpu-mid')?.gamingIndex).toBe(50);
  });

  it('renormalizes when a GPU is missing one suite', () => {
    const updates = computeGpuHardwareIndexes(
      ['gpu-both', 'gpu-ark-only'],
      [
        score('gpu-both', 'b-g3d', 20000),
        score('gpu-both', 'b-ark', 40),
        score('gpu-ark-only', 'b-ark', 40),
      ],
      [g3d, ark],
    );
    const byId = new Map(updates.map((row) => [row.hardwareId, row]));
    expect(byId.get('gpu-ark-only')?.gamingIndex).not.toBeNull();
    expect(byId.get('gpu-both')?.gamingIndex).toBe(100);
  });
});

describe('CPU hardware index', () => {
  it('fills single, multi, and blended gaming indexes', () => {
    const updates = computeCpuHardwareIndexes(
      ['cpu-a', 'cpu-b'],
      [
        score('cpu-a', 'b-single', 4000),
        score('cpu-b', 'b-single', 2000),
        score('cpu-a', 'b-multi', 50000),
        score('cpu-b', 'b-multi', 25000),
      ],
      [single, multi],
    );
    const byId = new Map(updates.map((row) => [row.hardwareId, row]));
    expect(byId.get('cpu-a')?.singleThreadIndex).toBe(100);
    expect(byId.get('cpu-b')?.singleThreadIndex).toBe(50);
    expect(byId.get('cpu-a')?.multiThreadIndex).toBe(100);
    expect(byId.get('cpu-b')?.multiThreadIndex).toBe(50);
    expect(byId.get('cpu-a')?.gamingIndex).toBe(100);
    expect(byId.get('cpu-b')?.gamingIndex).toBe(50);
  });

  it('blends with 65/35 when both categories exist', () => {
    const singleRaws = computeWeightedRaws(
      ['cpu-a', 'cpu-b'],
      [score('cpu-a', 'b-single', 4000), score('cpu-b', 'b-single', 4000)],
      [single],
    );
    const multiRaws = computeWeightedRaws(
      ['cpu-a', 'cpu-b'],
      [score('cpu-a', 'b-multi', 50000), score('cpu-b', 'b-multi', 10000)],
      [multi],
    );
    // Same single, different multi → gaming order follows multi with 35% pull.
    expect(singleRaws.get('cpu-a')).toBeCloseTo(1);
    expect(singleRaws.get('cpu-b')).toBeCloseTo(1);
    expect(multiRaws.get('cpu-a')).toBeCloseTo(1);
    expect(multiRaws.get('cpu-b')).toBeCloseTo(0.2);

    const updates = computeCpuHardwareIndexes(
      ['cpu-a', 'cpu-b'],
      [
        score('cpu-a', 'b-single', 4000),
        score('cpu-b', 'b-single', 4000),
        score('cpu-a', 'b-multi', 50000),
        score('cpu-b', 'b-multi', 10000),
      ],
      [single, multi],
    );
    const byId = new Map(updates.map((row) => [row.hardwareId, row]));
    expect(byId.get('cpu-a')?.gamingIndex).toBe(100);
    const expectedRawB =
      (CPU_GAMING_SINGLE_WEIGHT * 1 + CPU_GAMING_MULTI_WEIGHT * 0.2) /
      (CPU_GAMING_SINGLE_WEIGHT + CPU_GAMING_MULTI_WEIGHT);
    const expectedIndexB = Math.round(expectedRawB * 100 * 100) / 100;
    expect(byId.get('cpu-b')?.gamingIndex).toBe(expectedIndexB);
  });

  it('leaves CPUs without scores as null', () => {
    const updates = computeCpuHardwareIndexes(
      ['cpu-scored', 'cpu-empty'],
      [score('cpu-scored', 'b-single', 3000)],
      [single, multi],
    );
    const byId = new Map(updates.map((row) => [row.hardwareId, row]));
    expect(byId.get('cpu-scored')?.gamingIndex).toBe(100);
    expect(byId.get('cpu-empty')?.gamingIndex).toBeNull();
  });
});

describe('scaleRawsToIndex', () => {
  it('returns an empty map when there is no positive raw', () => {
    expect(scaleRawsToIndex(new Map([['a', 0]])).size).toBe(0);
  });
});
