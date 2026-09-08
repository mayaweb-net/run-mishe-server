import {
  QualityPreset,
  ScreenResolution,
  Upscaler,
  type PrismaClient,
} from '../../generated/prisma/client';

/**
 * Global fallback multipliers relative to 1080p / HIGH.
 * Source: document/estimation.md — DefaultScaling seed table.
 */
const RESOLUTION_FACTOR: Record<ScreenResolution, number> = {
  [ScreenResolution.R720P]: 1.55,
  [ScreenResolution.R1080P]: 1.0,
  [ScreenResolution.R1440P]: 0.66,
  [ScreenResolution.UW1440P]: 0.53,
  [ScreenResolution.R2160P]: 0.38,
  [ScreenResolution.UW2160P]: 0.3,
};

const PRESET_FACTOR: Record<QualityPreset, number> = {
  [QualityPreset.LOW]: 1.45,
  [QualityPreset.MEDIUM]: 1.18,
  [QualityPreset.HIGH]: 1.0,
  [QualityPreset.ULTRA]: 0.87,
};

function roundMultiplier(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export const DEFAULT_SCALING_ROWS = (
  Object.keys(RESOLUTION_FACTOR) as ScreenResolution[]
).flatMap((resolution) =>
  (Object.keys(PRESET_FACTOR) as QualityPreset[]).map((preset) => {
    const multiplier = roundMultiplier(
      RESOLUTION_FACTOR[resolution] * PRESET_FACTOR[preset],
    );
    return {
      resolution,
      preset,
      upscaler: Upscaler.NONE,
      rayTracing: false,
      multiplier,
      note: `${resolution} × ${preset} = ${RESOLUTION_FACTOR[resolution]} × ${PRESET_FACTOR[preset]}`,
    };
  }),
);

export async function seedDefaultScaling(prisma: PrismaClient): Promise<void> {
  for (const row of DEFAULT_SCALING_ROWS) {
    await prisma.defaultScaling.upsert({
      where: {
        resolution_preset_upscaler_rayTracing: {
          resolution: row.resolution,
          preset: row.preset,
          upscaler: row.upscaler,
          rayTracing: row.rayTracing,
        },
      },
      create: row,
      update: {
        multiplier: row.multiplier,
        note: row.note,
      },
    });
  }

  console.log(
    `DefaultScaling seed complete: ${DEFAULT_SCALING_ROWS.length} rows.`,
  );
}
