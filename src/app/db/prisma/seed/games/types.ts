export type GameRequirementTier = 'MINIMUM' | 'RECOMMENDED';

export interface GameRequirementSeed {
  tier: GameRequirementTier;
  rawCpuText: string | null;
  rawGpuText: string | null;
  os: string | null;
  ramGb: number | null;
  vramGb: number | null;
  storageGb: number | null;
  directX: string | null;
  needsSsd: boolean;
  notes: string | null;
}

export interface GameSeed {
  rank: number;
  sourceRank: number;
  steamAppId: number;
  name: string;
  releaseDate: string | null;
  developer: string | null;
  publisher: string | null;
  genres: readonly string[];
  coverUrl: string | null;
  description: string | null;
  popularity: number;
  sourceName: string;
  sourceUrl: string;
  requirements: readonly GameRequirementSeed[];
  steamSnapshot: unknown;
}
