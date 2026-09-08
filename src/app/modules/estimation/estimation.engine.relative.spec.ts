import { describe, expect, it } from 'vitest';
import { RELATIVE_REF_FPS } from './estimation.constants';
import {
  estimateFps,
  inferRecCpuIndexFromGpu,
  relativeCoefficientsFromRecommended,
} from './estimation.engine';

describe('relativeCoefficientsFromRecommended', () => {
  it('puts recommended hardware near ~60 FPS at 1080p HIGH after soft-min', () => {
    const recGpu = 14;
    const recCpu = 30;
    const profile = relativeCoefficientsFromRecommended({
      recGpuIndex: recGpu,
      recCpuIndex: recCpu,
    });

    const out = estimateFps({
      gpuIndex: recGpu,
      cpuIndex: recCpu,
      vramGb: 8,
      ramGb: 16,
      resolution: 'R1080P',
      preset: 'HIGH',
      upscaler: 'NONE',
      rayTracing: false,
      profile,
      scaling: 1,
      vramNeedGb: 6,
      ramNeedGb: 16,
      confidence: 'low',
    });

    expect(out.fpsGpu).toBeCloseTo(RELATIVE_REF_FPS, 0);
    expect(out.fpsCpu).toBeCloseTo(RELATIVE_REF_FPS, 0);
    expect(out.fps).toBeGreaterThanOrEqual(55);
    expect(out.fps).toBeLessThanOrEqual(62);
  });

  it('scales up when user GPU is stronger than recommended', () => {
    const profile = relativeCoefficientsFromRecommended({
      recGpuIndex: 14,
      recCpuIndex: 30,
    });

    const onRec = estimateFps({
      gpuIndex: 14,
      cpuIndex: 42,
      vramGb: 8,
      ramGb: 16,
      resolution: 'R1080P',
      preset: 'MEDIUM',
      upscaler: 'NONE',
      rayTracing: false,
      profile,
      scaling: 1.18,
      vramNeedGb: 6,
      ramNeedGb: 16,
      confidence: 'low',
    });

    const stronger = estimateFps({
      gpuIndex: 27,
      cpuIndex: 42,
      vramGb: 8,
      ramGb: 16,
      resolution: 'R1080P',
      preset: 'MEDIUM',
      upscaler: 'NONE',
      rayTracing: false,
      profile,
      scaling: 1.18,
      vramNeedGb: 6,
      ramNeedGb: 16,
      confidence: 'low',
    });

    expect(stronger.fps).toBeGreaterThan(onRec.fps);
  });

  it('infers a sane CPU index when recommended CPU is missing', () => {
    expect(inferRecCpuIndexFromGpu(14)).toBeGreaterThan(14);
    expect(inferRecCpuIndexFromGpu(14)).toBeLessThanOrEqual(70);
  });
});
