export type SeedVendor = 'NVIDIA' | 'AMD' | 'INTEL';
export type SeedFormFactor = 'DESKTOP' | 'LAPTOP';

/**
 * One reference GPU in the shipped catalogue.
 *
 * Only reference cards are listed - partner boards (ASUS/MSI/...) differ by a
 * few percent and would bloat search results without changing any estimate.
 */
export interface GpuSeed {
  slug: string;
  name: string;
  vendor: SeedVendor;
  formFactor: SeedFormFactor;

  /**
   * 1 = most widely sold, derived from how many retail boards exist for the
   * chip. Laptop parts are not sold as boards, so they all share the tail of
   * this ordering and are ranked by performance instead.
   */
  popularityRank: number;
  /** 1 = fastest in this catalogue, derived from the GPU Ark index. */
  performanceRank: number;

  family: string | null;
  series: string | null;
  architecture: string | null;
  codename: string | null;
  /** ISO date, e.g. "2023-05-18". */
  releaseDate: string | null;

  shadingUnits: number | null;
  tmus: number | null;
  rops: number | null;
  tensorCores: number | null;
  rayTracingCores: number | null;

  baseClockMhz: number | null;
  boostClockMhz: number | null;
  memoryClockMhz: number | null;

  vramGb: number | null;
  memoryType: string | null;
  memoryBusBits: number | null;
  bandwidthGbps: number | null;

  busInterface: string | null;
  pcieVersion: number | null;
  pcieLanes: number | null;

  tdpWatt: number | null;
  recommendedPsuW: number | null;
  supportsRayTracing: boolean;

  /** How many retail board models exist for this chip. Popularity signal. */
  retailBoardCount: number;
  /** Raw GPU Ark index. Also stored as a `GpuBenchmarkScore` row. */
  gpiScore: number;
  /** `gpiScore` rescaled to 0..100 against the fastest card in the catalogue. */
  gamingIndex: number;

  sourceUrl: string | null;
}

/**
 * One desktop CPU in the shipped catalogue.
 *
 * There is no `gamingIndex` here on purpose: the source dataset carries specs
 * only. The index job fills it once a benchmark source exists.
 */
export interface CpuSeed {
  slug: string;
  name: string;
  vendor: SeedVendor;

  family: string | null;
  series: string | null;
  generation: number | null;
  codename: string | null;
  architecture: string | null;
  socket: string | null;
  releaseYear: number | null;

  performanceCores: number;
  efficiencyCores: number;
  threads: number;

  baseClockMhz: number;
  boostClockMhz: number | null;

  l2CacheMb: number | null;
  l3CacheMb: number | null;
  tdpWatt: number | null;
  processNodeNm: number | null;

  isUnlocked: boolean;
  isX3d: boolean;

  /** iGPU model name as reported by the source; not linked to `Gpu` yet. */
  integratedGraphics: string | null;

  memoryTypes: string[];
  memoryChannels: number | null;
  maxMemoryGb: number | null;

  sourceUrl: string | null;
}
