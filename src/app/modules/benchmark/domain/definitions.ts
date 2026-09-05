import type { BenchmarkSlug, BenchmarkSource, HardwareTarget } from './types';

export interface BenchmarkDefinition {
  slug: BenchmarkSlug;
  name: string;
  vendor: string;
  source: BenchmarkSource;
  target: HardwareTarget;
  category: string;
  unit: string;
  higherIsBetter: true;
  description: string;
  sourceUrl: string;
}

export const BENCHMARK_DEFINITIONS: readonly BenchmarkDefinition[] = [
  {
    slug: 'passmark-cpu-mark',
    name: 'PassMark CPU Mark',
    vendor: 'PassMark',
    source: 'passmark',
    target: 'CPU',
    category: 'cpu-multi',
    unit: 'points',
    higherIsBetter: true,
    description:
      'PassMark PerformanceTest CPU Mark aggregate CPU performance score.',
    sourceUrl: 'https://www.cpubenchmark.net/cpu-list/',
  },
  {
    slug: 'passmark-single-thread',
    name: 'PassMark Single Thread Rating',
    vendor: 'PassMark',
    source: 'passmark',
    target: 'CPU',
    category: 'cpu-single',
    unit: 'points',
    higherIsBetter: true,
    description: 'PassMark CPU single-thread performance rating.',
    sourceUrl: 'https://www.cpubenchmark.net/singleThread.html',
  },
  {
    slug: 'passmark-g3d-mark',
    name: 'PassMark G3D Mark',
    vendor: 'PassMark',
    source: 'passmark',
    target: 'GPU',
    category: 'gpu-gaming',
    unit: 'points',
    higherIsBetter: true,
    description: 'PassMark PerformanceTest average G3D Mark rating.',
    sourceUrl: 'https://www.videocardbenchmark.net/gpu_list.php',
  },
  {
    slug: '3dmark-time-spy',
    name: '3DMark Time Spy Graphics',
    vendor: 'UL Solutions',
    source: '3dmark',
    target: 'GPU',
    category: 'gpu-gaming',
    unit: 'points',
    higherIsBetter: true,
    description:
      '3DMark Time Spy Graphics score. Time Spy is a DirectX 12 benchmark rendered at 2560x1440.',
    sourceUrl: 'https://benchmarks.ul.com/3dmark-time-spy',
  },
] as const;

const definitionBySlug = new Map(
  BENCHMARK_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export function getBenchmarkDefinition(
  slug: BenchmarkSlug,
): BenchmarkDefinition {
  const definition = definitionBySlug.get(slug);
  if (!definition) throw new Error(`Unknown benchmark: ${slug}`);
  return definition;
}

export function isBenchmarkSlug(value: string): value is BenchmarkSlug {
  return definitionBySlug.has(value as BenchmarkSlug);
}
