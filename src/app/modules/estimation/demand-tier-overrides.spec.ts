import { describe, expect, it } from 'vitest';
import { applyDemandTierOverride } from './demand-tier-overrides';

describe('applyDemandTierOverride', () => {
  it('bumps Wildlands from auto HEAVY to EXTREME', () => {
    const result = applyDemandTierOverride(
      'tom-clancy-s-ghost-recon-wildlands',
      'HEAVY',
    );
    expect(result).toEqual({ tier: 'EXTREME', overridden: true });
  });

  it('leaves unlisted games unchanged', () => {
    expect(applyDemandTierOverride('red-dead-redemption-2', 'HEAVY')).toEqual({
      tier: 'HEAVY',
      overridden: false,
    });
  });
});
