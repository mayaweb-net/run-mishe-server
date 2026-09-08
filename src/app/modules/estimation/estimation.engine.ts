/**
 * Pure FPS estimation (no Prisma / Redis / async).
 * Formula: document/estimation.md
 */

import {
  CPU_PRESET_FACTOR,
  type Coefficients,
  type ConfidenceLevel,
  type QualityPreset,
  type ScreenResolution,
  type Upscaler,
} from './estimation.constants';

export interface EstimateInput {
  gpuIndex: number;
  cpuIndex: number;
  vramGb: number;
  ramGb: number;
  resolution: ScreenResolution;
  preset: QualityPreset;
  upscaler: Upscaler;
  rayTracing: boolean;
  profile: Coefficients;
  /** Effective GPU scaling vs 1080p/HIGH (includes RT / upscaler factors). */
  scaling: number;
  vramNeedGb: number;
  ramNeedGb: number;
  confidence: ConfidenceLevel;
}

export interface EstimateOutput {
  fps: number;
  onePercentLow: number;
  fpsGpu: number;
  fpsCpu: number;
  limitedBy: 'CPU' | 'GPU';
  bottleneckPercent: number;
  vramPenalty: number;
  ramPenalty: number;
  vramRatio: number;
  ramRatio: number;
  confidence: ConfidenceLevel;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function softMin(a: number, b: number, k: number): number {
  if (!(a > 0) || !(b > 0)) return 0;
  if (!(k > 0)) return Math.min(a, b);
  return (a ** -k + b ** -k) ** (-1 / k);
}

export function memoryPenalty(
  haveGb: number,
  needGb: number,
  floor: number,
  slope: number,
): number {
  if (!(needGb > 0)) return 1;
  const ratio = haveGb / needGb;
  if (ratio >= 1) return 1;
  return clamp(floor + slope * ratio, floor, 1);
}

export function estimateFps(input: EstimateInput): EstimateOutput {
  const {
    gpuIndex,
    cpuIndex,
    vramGb,
    ramGb,
    preset,
    profile,
    scaling,
    vramNeedGb,
    ramNeedGb,
    confidence,
  } = input;

  const cpuPreset = CPU_PRESET_FACTOR[preset];
  const fpsGpu =
    profile.gpuCoef * gpuIndex ** profile.gpuExponent * scaling;
  const fpsCpu =
    profile.cpuCoef * cpuIndex ** profile.cpuExponent * cpuPreset;

  let fps = softMin(fpsGpu, fpsCpu, profile.blendK);

  const vramRatio = vramNeedGb > 0 ? vramGb / vramNeedGb : 1;
  const ramRatio = ramNeedGb > 0 ? ramGb / ramNeedGb : 1;
  const vramPenalty = memoryPenalty(vramGb, vramNeedGb, 0.35, 0.65);
  const ramPenalty = memoryPenalty(ramGb, ramNeedGb, 0.5, 0.5);
  fps *= vramPenalty * ramPenalty;

  const cpuHeadroom = clamp(fpsCpu / Math.max(fpsGpu, 1e-9) - 1, 0, 1);
  let lowRatio = 0.58 + 0.18 * cpuHeadroom;
  if (vramRatio < 1) lowRatio *= 0.85;
  const onePercentLow = fps * lowRatio;

  const limitedBy = fpsCpu < fpsGpu ? 'CPU' : 'GPU';
  const hi = Math.max(fpsGpu, fpsCpu);
  const lo = Math.min(fpsGpu, fpsCpu);
  const bottleneckPercent = hi > 0 ? ((hi - lo) / hi) * 100 : 0;

  return {
    fps: round1(fps),
    onePercentLow: round1(onePercentLow),
    fpsGpu: round1(fpsGpu),
    fpsCpu: round1(fpsCpu),
    limitedBy,
    bottleneckPercent: Math.round(bottleneckPercent * 10) / 10,
    vramPenalty: round1(vramPenalty),
    ramPenalty: round1(ramPenalty),
    vramRatio: round1(vramRatio),
    ramRatio: round1(ramRatio),
    confidence,
  };
}

export function bottleneckLabelFa(percent: number): string {
  if (percent < 10) return 'متعادل';
  if (percent < 25) return 'گلوگاه خفیف';
  if (percent < 45) return 'گلوگاه قابل‌توجه';
  return 'گلوگاه شدید';
}
