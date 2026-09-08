import type { DemandTier } from './demand-tier';

/**
 * Manual demand-tier corrections for titles where Steam Recommended
 * understates real GPU load (common for poorly optimized open-world games).
 *
 * Applied after the automatic recommended-GPU index mapping in
 * `runDemandTierJob`. Keep this list small and evidence-based.
 */
export const DEMAND_TIER_OVERRIDES: Readonly<Record<string, DemandTier>> = {
  // GTX 1060-era recommended, but open-world CPU/GPU load matches EXTREME
  // cold-start much better (PCGameCheck / similar estimators).
  'tom-clancy-s-ghost-recon-wildlands': 'EXTREME',
  'tom-clancy-s-ghost-recon-breakpoint': 'EXTREME',
};

export function applyDemandTierOverride(
  slug: string,
  autoTier: DemandTier,
): { tier: DemandTier; overridden: boolean } {
  const override = DEMAND_TIER_OVERRIDES[slug];
  if (!override || override === autoTier) {
    return { tier: autoTier, overridden: false };
  }
  return { tier: override, overridden: true };
}
