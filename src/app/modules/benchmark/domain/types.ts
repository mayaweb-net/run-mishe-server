export type HardwareTarget = 'CPU' | 'GPU';

export type BenchmarkSlug =
  | 'passmark-cpu-mark'
  | 'passmark-single-thread'
  | 'passmark-g3d-mark'
  | '3dmark-time-spy';

export type BenchmarkSource = 'passmark' | '3dmark';

export interface RawBenchmarkRecord {
  source: BenchmarkSource;
  benchmark: BenchmarkSlug;
  sourceUrl: string;
  capturedAt: string;
  hardwareName: string;
  score: number | string;
  rawPayload: unknown;
  sampleCount?: number;
  rank?: number;
  unit?: string;
  version?: string;
}

export interface ValidatedBenchmarkRecord extends Omit<
  RawBenchmarkRecord,
  'score' | 'unit'
> {
  score: number;
  unit: string;
}

export interface CatalogHardware {
  id?: string;
  slug: string;
  normalizedName: string;
  name: string;
  target: HardwareTarget;
  aliases?: string[];
}

export interface HardwareResolution {
  hardware: CatalogHardware | null;
  status: 'resolved' | 'unresolved';
  method?: 'normalized-name' | 'alias' | 'safe-normalization';
  reason?: string;
}

export interface SourceCrawlResult {
  source: BenchmarkSource;
  records: RawBenchmarkRecord[];
  unavailable?: string;
  errors: string[];
}

export interface CrawlSummary {
  loaded: number;
  found: number;
  missing: number;
  unresolved: number;
  errors: number;
  files: string[];
}

export interface MissingBenchmarkRecord {
  target: HardwareTarget;
  hardwareSlug: string;
  hardwareName: string;
  normalizedName: string;
  benchmark: BenchmarkSlug;
  source: BenchmarkSource;
  checkedAt: string;
  reason: 'not-found' | 'source-unavailable';
}
