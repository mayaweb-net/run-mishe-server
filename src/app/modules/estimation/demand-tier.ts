/**
 * Pure demand-tier math (no Prisma).
 *
 * Recommended GPU gamingIndex → tier.
 *
 *   < 8         → LIGHT    (very old / weak recommended)
 *   8 .. < 12   → MEDIUM   (1050 / 1650 class)
 *   12 .. < 20  → HEAVY    (1060–2060 / RDR2-class Steam specs)
 *   ≥ 20        → EXTREME  (3060+ recommended — GTA V Enhanced, modern UE5)
 */

export type DemandTier = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'EXTREME';

/** Inclusive lower bounds for MEDIUM / HEAVY / EXTREME. */
export const DEMAND_TIER_MEDIUM_MIN = 8;
export const DEMAND_TIER_HEAVY_MIN = 12;
export const DEMAND_TIER_EXTREME_MIN = 20;

export function demandTierFromRecommendedGpuIndex(
  maxRecommendedGpuIndex: number,
): DemandTier {
  if (!(maxRecommendedGpuIndex >= 0) || !Number.isFinite(maxRecommendedGpuIndex)) {
    throw new RangeError(
      `maxRecommendedGpuIndex must be a finite non-negative number, got ${maxRecommendedGpuIndex}`,
    );
  }
  if (maxRecommendedGpuIndex < DEMAND_TIER_MEDIUM_MIN) return 'LIGHT';
  if (maxRecommendedGpuIndex < DEMAND_TIER_HEAVY_MIN) return 'MEDIUM';
  if (maxRecommendedGpuIndex < DEMAND_TIER_EXTREME_MIN) return 'HEAVY';
  return 'EXTREME';
}

/**
 * Highest gamingIndex among candidate GPUs. Returns null when none are usable
 * (no options, or all missing index).
 */
export function maxGamingIndex(
  indexes: readonly (number | null | undefined)[],
): number | null {
  let max: number | null = null;
  for (const value of indexes) {
    if (value == null || !(value >= 0) || !Number.isFinite(value)) continue;
    if (max == null || value > max) max = value;
  }
  return max;
}

export function resolveDemandTierFromGpuIndexes(
  indexes: readonly (number | null | undefined)[],
): DemandTier | null {
  const max = maxGamingIndex(indexes);
  if (max == null) return null;
  return demandTierFromRecommendedGpuIndex(max);
}
