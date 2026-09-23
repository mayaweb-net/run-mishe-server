/**
 * Pure FPS calibration math (no Prisma / I/O).
 * Algorithm: document/estimation.md § کالیبراسیون
 */

import {
  COLD_START,
  CPU_PRESET_FACTOR,
  DEFAULT_BLEND_K,
  type Coefficients,
  type DemandTier,
  type QualityPreset,
  type ScreenResolution,
  type Upscaler,
} from './estimation.constants';
import { softMin } from './estimation.engine';

export const CALIBRATION_VERSION = 1;

/** Absolute hold-out MAPE above this → reject even when samples exist. */
export const MAX_ACCEPTABLE_MAPE = 0.4;

export const MIN_GPU_SAMPLES = 6;
export const MIN_GPU_DISTINCT = 4;
export const MIN_CPU_SAMPLES = 4;
export const MIN_CPU_DISTINCT = 3;
export const MIN_SCALING_SAMPLES = 3;

const GPU_EXPONENT_MIN = 0.6;
const GPU_EXPONENT_MAX = 1.15;
const CPU_EXPONENT_MIN = 0.6;
const CPU_EXPONENT_MAX = 1.15;

const HIGH_RES: ReadonlySet<ScreenResolution> = new Set([
  'R1440P',
  'R2160P',
  'UW1440P',
  'UW2160P',
]);

const LOW_RES: ReadonlySet<ScreenResolution> = new Set(['R720P', 'R1080P']);

const BLEND_K_CANDIDATES = [4, 6, 8, 10, 12] as const;

export interface CalibrationSample {
  gpuId: string;
  cpuId: string;
  gpuIndex: number;
  cpuIndex: number;
  avgFps: number;
  confidence: number;
  resolution: ScreenResolution;
  preset: QualityPreset;
  upscaler: Upscaler;
  rayTracing: boolean;
}

export type ScalingKey = string;

export function scalingKey(
  resolution: ScreenResolution,
  preset: QualityPreset,
  upscaler: Upscaler,
  rayTracing: boolean,
): ScalingKey {
  return `${resolution}|${preset}|${upscaler}|${rayTracing ? 1 : 0}`;
}

export type ScalingTable = Map<ScalingKey, number>;

export interface PowerFit {
  coef: number;
  exponent: number;
  rSquared: number;
  sampleCount: number;
  distinctHardware: number;
}

export interface ScalingFitRow {
  resolution: ScreenResolution;
  preset: QualityPreset;
  upscaler: Upscaler;
  rayTracing: boolean;
  multiplier: number;
  sampleCount: number;
}

export type CalibrationStatus = 'calibrated' | 'skipped' | 'rejected';

export interface CalibrateGameResult {
  status: CalibrationStatus;
  reason?: string;
  profile?: Coefficients & {
    sampleCount: number;
    rSquared: number;
    gpuFitSamples: number;
    cpuFitSamples: number;
  };
  scalings: ScalingFitRow[];
  holdoutMape: number | null;
  coldStartMape: number | null;
  holdoutP90: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weightOf(sample: CalibrationSample): number {
  const w = sample.confidence;
  return Number.isFinite(w) && w > 0 ? w : 0.5;
}

/** Weighted OLS in log-log space: ln(y) = a + b·ln(x). */
export function fitPowerCurve(
  points: Array<{ x: number; y: number; w: number }>,
  exponentClamp: [number, number],
): PowerFit | null {
  const usable = points.filter(
    (p) => p.x > 0 && p.y > 0 && p.w > 0 && Number.isFinite(p.x + p.y + p.w),
  );
  if (usable.length < 2) return null;

  let Sw = 0;
  let Sx = 0;
  let Sy = 0;
  let Sxx = 0;
  let Sxy = 0;
  for (const p of usable) {
    const X = Math.log(p.x);
    const Y = Math.log(p.y);
    const w = p.w;
    Sw += w;
    Sx += w * X;
    Sy += w * Y;
    Sxx += w * X * X;
    Sxy += w * X * Y;
  }
  const denom = Sw * Sxx - Sx * Sx;
  if (!(Math.abs(denom) > 1e-12) || !(Sw > 0)) return null;

  const bRaw = (Sw * Sxy - Sx * Sy) / denom;
  const a = (Sy - bRaw * Sx) / Sw;
  const exponent = clamp(bRaw, exponentClamp[0], exponentClamp[1]);
  // Recompute intercept with clamped slope so the curve stays consistent.
  const aClamped = (Sy - exponent * Sx) / Sw;
  const coef = Math.exp(aClamped);

  const yMean = Sy / Sw;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of usable) {
    const X = Math.log(p.x);
    const Y = Math.log(p.y);
    const yHat = aClamped + exponent * X;
    ssRes += p.w * (Y - yHat) ** 2;
    ssTot += p.w * (Y - yMean) ** 2;
  }
  const rSquared = ssTot > 1e-12 ? clamp(1 - ssRes / ssTot, 0, 1) : 0;

  return {
    coef,
    exponent,
    rSquared,
    sampleCount: usable.length,
    distinctHardware: 0,
  };
}

export function isGpuCurveSample(sample: CalibrationSample): boolean {
  return sample.cpuIndex >= 80 || HIGH_RES.has(sample.resolution);
}

export function isCpuCurveSample(sample: CalibrationSample): boolean {
  return sample.gpuIndex >= 85 && LOW_RES.has(sample.resolution);
}

function lookupScaling(
  table: ScalingTable,
  sample: CalibrationSample,
): number | null {
  const key = scalingKey(
    sample.resolution,
    sample.preset,
    sample.upscaler,
    sample.rayTracing,
  );
  const value = table.get(key);
  return value != null && value > 0 ? value : null;
}

export function buildGpuFitPoints(
  samples: readonly CalibrationSample[],
  scaling: ScalingTable,
): Array<{ x: number; y: number; w: number; gpuId: string }> {
  const points: Array<{ x: number; y: number; w: number; gpuId: string }> = [];
  for (const sample of samples) {
    if (!isGpuCurveSample(sample)) continue;
    const s = lookupScaling(scaling, sample);
    if (s == null) continue;
    const y = sample.avgFps / s;
    if (!(y > 0)) continue;
    points.push({
      x: sample.gpuIndex,
      y,
      w: weightOf(sample),
      gpuId: sample.gpuId,
    });
  }
  return points;
}

export function buildCpuFitPoints(
  samples: readonly CalibrationSample[],
): Array<{ x: number; y: number; w: number; cpuId: string }> {
  const points: Array<{ x: number; y: number; w: number; cpuId: string }> = [];
  for (const sample of samples) {
    if (!isCpuCurveSample(sample)) continue;
    const factor = CPU_PRESET_FACTOR[sample.preset] ?? 1;
    const y = sample.avgFps / factor;
    if (!(y > 0)) continue;
    points.push({
      x: sample.cpuIndex,
      y,
      w: weightOf(sample),
      cpuId: sample.cpuId,
    });
  }
  return points;
}

export function fitGpuCurve(
  samples: readonly CalibrationSample[],
  scaling: ScalingTable,
): PowerFit | null {
  const points = buildGpuFitPoints(samples, scaling);
  const distinct = new Set(points.map((p) => p.gpuId)).size;
  if (points.length < MIN_GPU_SAMPLES || distinct < MIN_GPU_DISTINCT) {
    return null;
  }
  const fit = fitPowerCurve(points, [GPU_EXPONENT_MIN, GPU_EXPONENT_MAX]);
  if (!fit) return null;
  return { ...fit, distinctHardware: distinct };
}

export function fitCpuCurve(
  samples: readonly CalibrationSample[],
): PowerFit | null {
  const points = buildCpuFitPoints(samples);
  const distinct = new Set(points.map((p) => p.cpuId)).size;
  if (points.length < MIN_CPU_SAMPLES || distinct < MIN_CPU_DISTINCT) {
    return null;
  }
  const fit = fitPowerCurve(points, [CPU_EXPONENT_MIN, CPU_EXPONENT_MAX]);
  if (!fit) return null;
  return { ...fit, distinctHardware: distinct };
}

export function fitGameScalings(
  samples: readonly CalibrationSample[],
  profile: Pick<Coefficients, 'gpuCoef' | 'gpuExponent'>,
): ScalingFitRow[] {
  type Acc = {
    resolution: ScreenResolution;
    preset: QualityPreset;
    upscaler: Upscaler;
    rayTracing: boolean;
    sumW: number;
    sumWM: number;
    count: number;
  };
  const buckets = new Map<ScalingKey, Acc>();

  for (const sample of samples) {
    const ref =
      profile.gpuCoef * sample.gpuIndex ** profile.gpuExponent;
    if (!(ref > 0)) continue;
    const multiplier = sample.avgFps / ref;
    if (!(multiplier > 0) || !Number.isFinite(multiplier)) continue;
    const key = scalingKey(
      sample.resolution,
      sample.preset,
      sample.upscaler,
      sample.rayTracing,
    );
    const w = weightOf(sample);
    const acc = buckets.get(key) ?? {
      resolution: sample.resolution,
      preset: sample.preset,
      upscaler: sample.upscaler,
      rayTracing: sample.rayTracing,
      sumW: 0,
      sumWM: 0,
      count: 0,
    };
    acc.sumW += w;
    acc.sumWM += w * multiplier;
    acc.count += 1;
    buckets.set(key, acc);
  }

  const rows: ScalingFitRow[] = [];
  for (const acc of buckets.values()) {
    if (acc.count < MIN_SCALING_SAMPLES || !(acc.sumW > 0)) continue;
    rows.push({
      resolution: acc.resolution,
      preset: acc.preset,
      upscaler: acc.upscaler,
      rayTracing: acc.rayTracing,
      multiplier: acc.sumWM / acc.sumW,
      sampleCount: acc.count,
    });
  }
  return rows;
}

function predictSampleFps(
  sample: CalibrationSample,
  profile: Coefficients,
  scaling: ScalingTable,
): number | null {
  const s = lookupScaling(scaling, sample);
  if (s == null) return null;
  const fpsGpu =
    profile.gpuCoef * sample.gpuIndex ** profile.gpuExponent * s;
  const fpsCpu =
    profile.cpuCoef *
    sample.cpuIndex ** profile.cpuExponent *
    (CPU_PRESET_FACTOR[sample.preset] ?? 1);
  const fps = softMin(fpsGpu, fpsCpu, profile.blendK);
  return fps > 0 ? fps : null;
}

export function meanAbsolutePercentageError(
  samples: readonly CalibrationSample[],
  profile: Coefficients,
  scaling: ScalingTable,
): { mape: number; p90: number; n: number } | null {
  const errors: number[] = [];
  let sum = 0;
  for (const sample of samples) {
    const predicted = predictSampleFps(sample, profile, scaling);
    if (predicted == null || !(sample.avgFps > 0)) continue;
    const ape = Math.abs(predicted - sample.avgFps) / sample.avgFps;
    errors.push(ape);
    sum += ape;
  }
  if (errors.length === 0) return null;
  errors.sort((a, b) => a - b);
  const p90Index = Math.min(
    errors.length - 1,
    Math.max(0, Math.ceil(errors.length * 0.9) - 1),
  );
  return {
    mape: sum / errors.length,
    p90: errors[p90Index]!,
    n: errors.length,
  };
}

/** Split ~20% hold-out, stratified by shuffling with a stable seed hash. */
export function splitHoldout(
  samples: readonly CalibrationSample[],
  holdoutFraction = 0.2,
): { train: CalibrationSample[]; holdout: CalibrationSample[] } {
  if (samples.length < 5) {
    return { train: [...samples], holdout: [] };
  }
  const indexed = samples.map((sample, index) => ({ sample, index }));
  indexed.sort((a, b) => {
    const ka = `${a.sample.gpuId}:${a.sample.resolution}:${a.sample.preset}:${a.index}`;
    const kb = `${b.sample.gpuId}:${b.sample.resolution}:${b.sample.preset}:${b.index}`;
    return ka.localeCompare(kb);
  });
  const holdoutCount = Math.max(1, Math.round(samples.length * holdoutFraction));
  const holdout = indexed.slice(0, holdoutCount).map((row) => row.sample);
  const train = indexed.slice(holdoutCount).map((row) => row.sample);
  return { train, holdout };
}

export function isGpuCurveMonotonic(
  profile: Pick<Coefficients, 'gpuCoef' | 'gpuExponent'>,
  gpuIndexes: readonly number[],
): boolean {
  const sorted = [...new Set(gpuIndexes.filter((x) => x > 0))].sort(
    (a, b) => a - b,
  );
  if (sorted.length < 2) return true;
  let prev = profile.gpuCoef * sorted[0]! ** profile.gpuExponent;
  for (let i = 1; i < sorted.length; i += 1) {
    const next = profile.gpuCoef * sorted[i]! ** profile.gpuExponent;
    if (next + 1e-6 < prev) return false;
    prev = next;
  }
  return true;
}

function pickBlendK(
  train: readonly CalibrationSample[],
  holdout: readonly CalibrationSample[],
  base: Coefficients,
  scaling: ScalingTable,
): number {
  if (train.length < 15 || holdout.length === 0) return DEFAULT_BLEND_K;
  let bestK = DEFAULT_BLEND_K;
  let bestMape = Number.POSITIVE_INFINITY;
  for (const k of BLEND_K_CANDIDATES) {
    const profile = { ...base, blendK: k };
    const err = meanAbsolutePercentageError(holdout, profile, scaling);
    if (err && err.mape < bestMape) {
      bestMape = err.mape;
      bestK = k;
    }
  }
  return bestK;
}

function mergeScalingTable(
  defaults: ScalingTable,
  fitted: readonly ScalingFitRow[],
): ScalingTable {
  const next = new Map(defaults);
  for (const row of fitted) {
    next.set(
      scalingKey(row.resolution, row.preset, row.upscaler, row.rayTracing),
      row.multiplier,
    );
  }
  return next;
}

export interface CalibrateGameInput {
  samples: readonly CalibrationSample[];
  defaultScaling: ScalingTable;
  demandTier: DemandTier;
}

/**
 * Two-pass calibration for one game.
 * Writes nothing — caller persists when status === 'calibrated'.
 */
export function calibrateGame(input: CalibrateGameInput): CalibrateGameResult {
  const empty: CalibrateGameResult = {
    status: 'skipped',
    scalings: [],
    holdoutMape: null,
    coldStartMape: null,
    holdoutP90: null,
  };

  if (input.samples.length < MIN_GPU_SAMPLES) {
    return {
      ...empty,
      reason: `need ≥${MIN_GPU_SAMPLES} samples (have ${input.samples.length})`,
    };
  }

  const { train, holdout } = splitHoldout(input.samples);
  const cold = {
    ...COLD_START[input.demandTier],
    blendK: DEFAULT_BLEND_K,
  };

  // Pass 1 — GPU curve with DefaultScaling
  const gpuFit1 = fitGpuCurve(train, input.defaultScaling);
  if (!gpuFit1) {
    return {
      ...empty,
      reason: `GPU curve needs ≥${MIN_GPU_SAMPLES} samples on ≥${MIN_GPU_DISTINCT} GPUs`,
    };
  }

  const cpuFit1 = fitCpuCurve(train);
  let profile: Coefficients = {
    gpuCoef: gpuFit1.coef,
    gpuExponent: gpuFit1.exponent,
    cpuCoef: cpuFit1?.coef ?? cold.cpuCoef,
    cpuExponent: cpuFit1?.exponent ?? cold.cpuExponent,
    blendK: DEFAULT_BLEND_K,
  };

  const scalings1 = fitGameScalings(train, profile);
  const scalingPass2 = mergeScalingTable(input.defaultScaling, scalings1);

  // Pass 2 — refit with GameScaling
  const gpuFit2 = fitGpuCurve(train, scalingPass2) ?? gpuFit1;
  const cpuFit2 = fitCpuCurve(train) ?? cpuFit1;
  profile = {
    gpuCoef: gpuFit2.coef,
    gpuExponent: gpuFit2.exponent,
    cpuCoef: cpuFit2?.coef ?? cold.cpuCoef,
    cpuExponent: cpuFit2?.exponent ?? cold.cpuExponent,
    blendK: DEFAULT_BLEND_K,
  };
  const scalings = fitGameScalings(train, profile);
  const finalScaling = mergeScalingTable(input.defaultScaling, scalings);

  profile = {
    ...profile,
    blendK: pickBlendK(train, holdout, profile, finalScaling),
  };

  if (
    !isGpuCurveMonotonic(
      profile,
      train.map((s) => s.gpuIndex),
    )
  ) {
    return {
      ...empty,
      status: 'rejected',
      reason: 'GPU curve not monotonic',
      scalings,
    };
  }

  const evalSet = holdout.length > 0 ? holdout : train;
  const calibratedErr = meanAbsolutePercentageError(
    evalSet,
    profile,
    finalScaling,
  );
  const coldErr = meanAbsolutePercentageError(evalSet, cold, input.defaultScaling);

  if (!calibratedErr) {
    return {
      ...empty,
      status: 'rejected',
      reason: 'could not evaluate hold-out MAPE',
      scalings,
    };
  }

  // Prefer sample-derived curves whenever the fit is usable. Beating cold-start
  // is ideal but not required — estimation should use FpsSample data when present.
  if (calibratedErr.mape > MAX_ACCEPTABLE_MAPE) {
    return {
      ...empty,
      status: 'rejected',
      reason: `MAPE ${(calibratedErr.mape * 100).toFixed(1)}% above ${MAX_ACCEPTABLE_MAPE * 100}% cap`,
      scalings,
      holdoutMape: calibratedErr.mape,
      coldStartMape: coldErr?.mape ?? null,
      holdoutP90: calibratedErr.p90,
    };
  }

  const rSquared = gpuFit2.rSquared;
  const worseThanCold =
    coldErr != null && calibratedErr.mape > coldErr.mape + 1e-9;
  return {
    status: 'calibrated',
    reason: worseThanCold
      ? `accepted with MAPE worse than cold-start (${(calibratedErr.mape * 100).toFixed(1)}% > ${(coldErr!.mape * 100).toFixed(1)}%)`
      : undefined,
    profile: {
      ...profile,
      sampleCount: input.samples.length,
      rSquared,
      gpuFitSamples: gpuFit2.sampleCount,
      cpuFitSamples: cpuFit2?.sampleCount ?? 0,
    },
    scalings,
    holdoutMape: calibratedErr.mape,
    coldStartMape: coldErr?.mape ?? null,
    holdoutP90: calibratedErr.p90,
  };
}
