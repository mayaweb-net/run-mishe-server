import { describe, expect, it } from 'vitest';
import {
  calibrateGame,
  fitPowerCurve,
  isGpuCurveMonotonic,
  meanAbsolutePercentageError,
  scalingKey,
  type CalibrationSample,
  type ScalingTable,
} from './calibration';
import type { DemandTier } from './estimation.constants';

function sample(
  partial: Partial<CalibrationSample> &
    Pick<CalibrationSample, 'gpuId' | 'gpuIndex' | 'avgFps'>,
): CalibrationSample {
  return {
    cpuId: 'cpu-1',
    cpuIndex: 90,
    confidence: 0.8,
    resolution: 'R1080P',
    preset: 'HIGH',
    upscaler: 'NONE',
    rayTracing: false,
    ...partial,
  };
}

function defaultScaling(): ScalingTable {
  const table: ScalingTable = new Map();
  const presets = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const;
  const resMult: Record<string, number> = {
    R720P: 1.8,
    R1080P: 1.0,
    R1440P: 0.66,
    R2160P: 0.38,
  };
  const presetMult: Record<string, number> = {
    LOW: 1.45,
    MEDIUM: 1.18,
    HIGH: 1.0,
    ULTRA: 0.87,
  };
  for (const [resolution, rm] of Object.entries(resMult)) {
    for (const preset of presets) {
      table.set(
        scalingKey(
          resolution as CalibrationSample['resolution'],
          preset,
          'NONE',
          false,
        ),
        rm * presetMult[preset]!,
      );
    }
  }
  return table;
}

describe('fitPowerCurve', () => {
  it('recovers an exact power law', () => {
    const coef = 3.5;
    const exponent = 0.9;
    const points = [20, 30, 40, 50, 60, 70].map((x) => ({
      x,
      y: coef * x ** exponent,
      w: 1,
    }));
    const fit = fitPowerCurve(points, [0.6, 1.15]);
    expect(fit).not.toBeNull();
    expect(fit!.coef).toBeCloseTo(coef, 4);
    expect(fit!.exponent).toBeCloseTo(exponent, 4);
    expect(fit!.rSquared).toBeGreaterThan(0.999);
  });
});

describe('calibrateGame', () => {
  it('calibrates when synthetic GPU samples follow a power curve', () => {
    const trueCoef = 4.2;
    const trueExp = 0.88;
    const gpus = [
      { id: 'g1', index: 20 },
      { id: 'g2', index: 30 },
      { id: 'g3', index: 40 },
      { id: 'g4', index: 55 },
      { id: 'g5', index: 70 },
      { id: 'g6', index: 85 },
    ];
    const samples: CalibrationSample[] = [];
    for (const gpu of gpus) {
      for (const resolution of ['R1080P', 'R1440P'] as const) {
        const scaling = resolution === 'R1080P' ? 1 : 0.66;
        const avgFps = trueCoef * gpu.index ** trueExp * scaling;
        samples.push(
          sample({
            gpuId: gpu.id,
            gpuIndex: gpu.index,
            avgFps,
            resolution,
            preset: 'HIGH',
          }),
        );
      }
    }

    const result = calibrateGame({
      samples,
      defaultScaling: defaultScaling(),
      demandTier: 'HEAVY' as DemandTier,
    });

    expect(result.status).toBe('calibrated');
    expect(result.profile!.gpuExponent).toBeCloseTo(trueExp, 1);
    expect(result.profile!.gpuCoef).toBeCloseTo(trueCoef, 0);
    expect(result.holdoutMape!).toBeLessThan(0.15);
    expect(isGpuCurveMonotonic(result.profile!, gpus.map((g) => g.index))).toBe(
      true,
    );
  });

  it('skips when there are too few distinct GPUs', () => {
    const samples = [1, 2, 3, 4, 5, 6].map((i) =>
      sample({
        gpuId: 'only-one',
        gpuIndex: 40 + i,
        avgFps: 60 + i,
      }),
    );
    const result = calibrateGame({
      samples,
      defaultScaling: defaultScaling(),
      demandTier: 'MEDIUM',
    });
    expect(result.status).toBe('skipped');
  });
});

describe('meanAbsolutePercentageError', () => {
  it('is ~0 for a perfect profile', () => {
    const samples = [
      sample({ gpuId: 'a', gpuIndex: 40, avgFps: 80 }),
      sample({ gpuId: 'b', gpuIndex: 50, avgFps: 100 }),
    ];
    // Force profile so fpsGpu ≈ avgFps with high cpu ceiling
    const profile = {
      gpuCoef: 2,
      gpuExponent: 1,
      cpuCoef: 1000,
      cpuExponent: 1,
      blendK: 8,
    };
    // 2 * 40^1 = 80, 2 * 50^1 = 100
    const err = meanAbsolutePercentageError(
      samples,
      profile,
      defaultScaling(),
    );
    expect(err).not.toBeNull();
    expect(err!.mape).toBeLessThan(0.05);
  });
});
