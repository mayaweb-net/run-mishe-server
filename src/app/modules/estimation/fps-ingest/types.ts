import type {
  QualityPreset,
  ScreenResolution,
} from '@/app/db/generated/prisma/client';

export const FPS_SOURCE = 'notebookcheck' as const;

export type FpsSource = typeof FPS_SOURCE;

export interface NbcSettingSpec {
  /** NotebookCheck `settings_class_array[]` value. */
  settingsClass: number;
  resolution: ScreenResolution;
  preset: QualityPreset;
}

export interface NbcGameMapEntry {
  /** Allowlist / Game.slug */
  slug: string;
  name: string;
  /** NotebookCheck `#bl_gameselect` option value; null = not on NBC lists. */
  nbcGameId: number | null;
  notes?: string;
}

export interface RawFpsSampleRecord {
  source: FpsSource;
  sourceUrl: string;
  gameSlug: string;
  nbcGameId: number;
  gpuName: string;
  resolution: ScreenResolution;
  preset: QualityPreset;
  avgFps: number;
  sampleCount?: number;
  confidence: number;
  capturedAt: string;
}

export interface MissingFpsRecord {
  source: FpsSource;
  reason:
    | 'no-nbc-id'
    | 'empty-table'
    | 'gpu-unresolved'
    | 'gpu-not-in-top60'
    | 'game-unresolved'
    | 'invalid-fps';
  gameSlug?: string;
  nbcGameId?: number;
  gpuName?: string;
  detail?: string;
  checkedAt: string;
}

export interface CachedHtmlResponse {
  url: string;
  finalUrl?: string;
  capturedAt: string;
  status: number;
  body: string;
}

export interface TopHardwareSelection {
  gpus: Array<{ id: string; slug: string; name: string; gamingIndex: number }>;
  cpu: { id: string; slug: string; name: string; gamingIndex: number };
}
