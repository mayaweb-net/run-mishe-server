import { describe, expect, it } from 'vitest';
import { coldStartCoefficients } from './estimation.constants';
import {
  bottleneckLabelFa,
  estimateFps,
  memoryPenalty,
  softMin,
} from './estimation.engine';

describe('softMin', () => {
  it('drops ~8% when balanced at k=8', () => {
    const value = softMin(100, 100, 8);
    expect(value).toBeCloseTo(91.7, 0);
  });

  it('converges toward the min when limits diverge', () => {
    expect(softMin(100, 40, 8)).toBeCloseTo(40, 0);
  });
});

describe('memoryPenalty', () => {
  it('is 1 when capacity meets need', () => {
    expect(memoryPenalty(8, 8, 0.35, 0.65)).toBe(1);
    expect(memoryPenalty(16, 8, 0.35, 0.65)).toBe(1);
  });

  it('scales down under need with the documented floor', () => {
    expect(memoryPenalty(4, 8, 0.35, 0.65)).toBeCloseTo(0.35 + 0.65 * 0.5, 5);
  });
});

describe('estimateFps cold-start Cyberpunk check', () => {
  it('matches estimation.md RTX 4060 + R5 3600 @ 1080p HIGH', () => {
    const out = estimateFps({
      gpuIndex: 25,
      cpuIndex: 45,
      vramGb: 8,
      ramGb: 16,
      resolution: 'R1080P',
      preset: 'HIGH',
      upscaler: 'NONE',
      rayTracing: false,
      profile: coldStartCoefficients('HEAVY'),
      scaling: 1,
      vramNeedGb: 7,
      ramNeedGb: 16,
      confidence: 'low',
    });

    expect(out.fpsGpu).toBeCloseTo(68, 0);
    expect(out.fpsCpu).toBeCloseTo(171, 0);
    expect(out.fps).toBeGreaterThanOrEqual(60);
    expect(out.fps).toBeLessThanOrEqual(72);
    expect(out.limitedBy).toBe('GPU');
    expect(out.confidence).toBe('low');
    expect(bottleneckLabelFa(out.bottleneckPercent)).toMatch(/گلوگاه|متعادل/);
  });
});
