/**
 * Tables from document/estimation.md — cold-start FPS defaults.
 */

export type DemandTier = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'EXTREME';
export type QualityPreset = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';
export type ScreenResolution =
  | 'R720P'
  | 'R1080P'
  | 'R1440P'
  | 'R2160P'
  | 'UW1440P'
  | 'UW2160P';
export type Upscaler =
  | 'NONE'
  | 'DLSS_QUALITY'
  | 'DLSS_BALANCED'
  | 'DLSS_PERFORMANCE'
  | 'FSR_QUALITY'
  | 'FSR_BALANCED'
  | 'FSR_PERFORMANCE'
  | 'XESS_QUALITY'
  | 'XESS_BALANCED';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Bump when the FPS formula or cold-start tables change (invalidates Redis). */
export const ESTIMATION_ENGINE_VERSION = 8;

export const DEFAULT_BLEND_K = 8;

/**
 * Relative cold-start: on Recommended GPU+CPU at 1080p/HIGH, target ~60 FPS
 * after soft-min. REF is slightly above 60 so softMin(REF, REF, 8) ≈ 60.
 */
export const RELATIVE_REF_FPS = 65.5;
export const RELATIVE_GPU_EXPONENT = 0.88;
export const RELATIVE_CPU_EXPONENT = 1.0;

export type EstimateMethod =
  | 'calibrated'
  | 'relative-recommended'
  | 'demand-tier';

export interface Coefficients {
  gpuCoef: number;
  gpuExponent: number;
  cpuCoef: number;
  cpuExponent: number;
  blendK: number;
}

/**
 * Cold-start curves.
 * HEAVY: RDR2-class (GTX 1060-era recommended).
 * EXTREME: modern recommended (RTX 3060+), e.g. GTA V Enhanced.
 */
export const COLD_START: Record<
  DemandTier,
  Omit<Coefficients, 'blendK'>
> = {
  LIGHT: { gpuCoef: 28.5, gpuExponent: 0.75, cpuCoef: 7.0, cpuExponent: 1.0 },
  MEDIUM: { gpuCoef: 8.75, gpuExponent: 0.82, cpuCoef: 4.5, cpuExponent: 1.0 },
  HEAVY: { gpuCoef: 4.0, gpuExponent: 0.88, cpuCoef: 3.8, cpuExponent: 1.0 },
  EXTREME: { gpuCoef: 2.4, gpuExponent: 0.92, cpuCoef: 3.3, cpuExponent: 1.0 },
};

export const CPU_PRESET_FACTOR: Record<QualityPreset, number> = {
  LOW: 1.1,
  MEDIUM: 1.04,
  HIGH: 1.0,
  ULTRA: 0.98,
};

/** Applied when DefaultScaling / GameScaling is the NONE / no-RT base row. */
export const RT_FACTOR = 0.55;

export const UPSCALER_FACTOR: Record<Upscaler, number> = {
  NONE: 1,
  DLSS_QUALITY: 1.4,
  DLSS_BALANCED: 1.55,
  DLSS_PERFORMANCE: 1.75,
  FSR_QUALITY: 1.4,
  FSR_BALANCED: 1.55,
  FSR_PERFORMANCE: 1.75,
  XESS_QUALITY: 1.4,
  XESS_BALANCED: 1.55,
};

export const COLD_RAM_NEED_GB: Record<DemandTier, number> = {
  LIGHT: 8,
  MEDIUM: 12,
  HEAVY: 16,
  /** Many EXTREME Steam pages still list 16 GB; keep cold-start aligned. */
  EXTREME: 16,
};

/**
 * VRAM need (GB) for cold-start. Anchors from estimation.md; other cells
 * filled to keep monotonic resolution/preset behaviour.
 */
export const COLD_VRAM_NEED_GB: Record<
  DemandTier,
  Record<ScreenResolution, Record<QualityPreset, number>>
> = {
  LIGHT: {
    R720P: { LOW: 2, MEDIUM: 2, HIGH: 2.5, ULTRA: 3 },
    R1080P: { LOW: 2, MEDIUM: 2.5, HIGH: 3, ULTRA: 3.5 },
    R1440P: { LOW: 3, MEDIUM: 3.5, HIGH: 4, ULTRA: 4.5 },
    UW1440P: { LOW: 3.5, MEDIUM: 4, HIGH: 4.5, ULTRA: 5 },
    R2160P: { LOW: 4, MEDIUM: 4.5, HIGH: 5, ULTRA: 6 },
    UW2160P: { LOW: 4.5, MEDIUM: 5, HIGH: 5.5, ULTRA: 6.5 },
  },
  MEDIUM: {
    R720P: { LOW: 3.5, MEDIUM: 4, HIGH: 4.5, ULTRA: 5 },
    R1080P: { LOW: 4, MEDIUM: 4.5, HIGH: 5, ULTRA: 6 },
    R1440P: { LOW: 5, MEDIUM: 5.5, HIGH: 6, ULTRA: 7 },
    UW1440P: { LOW: 5.5, MEDIUM: 6, HIGH: 7, ULTRA: 8 },
    R2160P: { LOW: 6.5, MEDIUM: 7, HIGH: 8, ULTRA: 9 },
    UW2160P: { LOW: 7, MEDIUM: 8, HIGH: 9, ULTRA: 10 },
  },
  HEAVY: {
    R720P: { LOW: 5, MEDIUM: 5.5, HIGH: 6, ULTRA: 7 },
    R1080P: { LOW: 5.5, MEDIUM: 6, HIGH: 7, ULTRA: 8 },
    R1440P: { LOW: 6.5, MEDIUM: 7, HIGH: 8, ULTRA: 9 },
    UW1440P: { LOW: 7, MEDIUM: 8, HIGH: 9, ULTRA: 10 },
    R2160P: { LOW: 8, MEDIUM: 9, HIGH: 10, ULTRA: 12 },
    UW2160P: { LOW: 9, MEDIUM: 10, HIGH: 11, ULTRA: 13 },
  },
  EXTREME: {
    R720P: { LOW: 6, MEDIUM: 7, HIGH: 8, ULTRA: 9 },
    R1080P: { LOW: 7, MEDIUM: 8, HIGH: 9, ULTRA: 10 },
    R1440P: { LOW: 9, MEDIUM: 10, HIGH: 11, ULTRA: 12 },
    UW1440P: { LOW: 10, MEDIUM: 11, HIGH: 12, ULTRA: 13 },
    R2160P: { LOW: 11, MEDIUM: 12, HIGH: 13, ULTRA: 16 },
    UW2160P: { LOW: 12, MEDIUM: 13, HIGH: 14, ULTRA: 17 },
  },
};

export const DEFAULT_ESTIMATE_RESOLUTIONS: ScreenResolution[] = [
  'R720P',
  'R1080P',
  'R1440P',
  'R2160P',
];

export function coldStartCoefficients(tier: DemandTier): Coefficients {
  return { ...COLD_START[tier], blendK: DEFAULT_BLEND_K };
}

export function coldVramNeedGb(
  tier: DemandTier,
  resolution: ScreenResolution,
  preset: QualityPreset,
): number {
  return COLD_VRAM_NEED_GB[tier][resolution][preset];
}

export function confidenceFromCalibration(input: {
  isCalibrated: boolean;
  rSquared: number | null | undefined;
  sampleCount: number;
}): ConfidenceLevel {
  if (
    input.isCalibrated &&
    input.rSquared != null &&
    input.rSquared > 0.9 &&
    input.sampleCount >= 15
  ) {
    return 'high';
  }
  if (input.isCalibrated) return 'medium';
  return 'low';
}

export function confidenceLabelFa(level: ConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'بالا';
    case 'medium':
      return 'متوسط';
    case 'low':
      return 'تخمینی';
  }
}
