import { describe, expect, it } from 'vitest';
import {
  DEMAND_TIER_EXTREME_MIN,
  DEMAND_TIER_HEAVY_MIN,
  DEMAND_TIER_MEDIUM_MIN,
  demandTierFromRecommendedGpuIndex,
  maxGamingIndex,
  resolveDemandTierFromGpuIndexes,
} from './demand-tier';

describe('demandTierFromRecommendedGpuIndex', () => {
  it('maps boundaries from estimation.md', () => {
    expect(demandTierFromRecommendedGpuIndex(0)).toBe('LIGHT');
    expect(demandTierFromRecommendedGpuIndex(DEMAND_TIER_MEDIUM_MIN - 0.01)).toBe(
      'LIGHT',
    );
    expect(demandTierFromRecommendedGpuIndex(DEMAND_TIER_MEDIUM_MIN)).toBe(
      'MEDIUM',
    );
    expect(demandTierFromRecommendedGpuIndex(DEMAND_TIER_HEAVY_MIN - 0.01)).toBe(
      'MEDIUM',
    );
    expect(demandTierFromRecommendedGpuIndex(DEMAND_TIER_HEAVY_MIN)).toBe(
      'HEAVY',
    );
    expect(
      demandTierFromRecommendedGpuIndex(DEMAND_TIER_EXTREME_MIN - 0.01),
    ).toBe('HEAVY');
    expect(demandTierFromRecommendedGpuIndex(DEMAND_TIER_EXTREME_MIN)).toBe(
      'EXTREME',
    );
    expect(demandTierFromRecommendedGpuIndex(100)).toBe('EXTREME');
  });

  it('rejects invalid indexes', () => {
    expect(() => demandTierFromRecommendedGpuIndex(-1)).toThrow(RangeError);
    expect(() => demandTierFromRecommendedGpuIndex(Number.NaN)).toThrow(
      RangeError,
    );
  });
});

describe('resolveDemandTierFromGpuIndexes', () => {
  it('uses the strongest recommended GPU', () => {
    expect(resolveDemandTierFromGpuIndexes([5, 12, null, 15])).toBe('HEAVY');
    expect(resolveDemandTierFromGpuIndexes([5, 12, null, 25])).toBe('EXTREME');
    expect(resolveDemandTierFromGpuIndexes([null, undefined])).toBeNull();
    expect(maxGamingIndex([3, 9, 7])).toBe(9);
  });
});
