import { normalizeHardwareName } from '@/app/common/hardware/normalize-hardware-name';
import type { PrismaClient } from '@/app/db/generated/prisma/client';
import { HardwareResolver } from './domain/hardware-resolver';
import type { CatalogHardware, ValidatedBenchmarkRecord } from './domain/types';
import {
  parsePositiveScore,
  validateRawBenchmarkRecord,
} from './domain/validation';
import {
  BenchmarkImporter,
  decideScoreWrite,
  sortImportRecords,
} from './importer/benchmark-importer';
import {
  parsePassMarkCpuMark,
  parsePassMarkCpuDetail,
  parsePassMarkG3d,
  parsePassMarkGpuDetail,
  parsePassMarkSingleThread,
} from './sources/passmark-parser';

const capturedAt = '2026-09-05T00:00:00.000Z';
const sourceUrl = 'https://www.cpubenchmark.net/cpu_list.php';

describe('hardware name normalization and matching', () => {
  const hardware: CatalogHardware[] = [
    {
      id: 'cpu-x3d',
      slug: 'amd-ryzen-7-7800x3d',
      normalizedName: normalizeHardwareName('AMD Ryzen 7 7800X3D'),
      name: 'AMD Ryzen 7 7800X3D',
      target: 'CPU',
      aliases: ['Ryzen 7 7800X3D', '7800X3D'],
    },
    {
      id: 'cpu-x',
      slug: 'amd-ryzen-7-7800x',
      normalizedName: normalizeHardwareName('AMD Ryzen 7 7800X'),
      name: 'AMD Ryzen 7 7800X',
      target: 'CPU',
    },
    {
      id: 'cpu-phenom-x3',
      slug: 'amd-phenom-x3-8650',
      normalizedName: normalizeHardwareName('AMD Phenom X3 8650'),
      name: 'AMD Phenom X3 8650',
      target: 'CPU',
    },
    {
      id: 'cpu-fx-8370e',
      slug: 'amd-fx-fx-8370e',
      normalizedName: normalizeHardwareName('AMD FX FX 8370E'),
      name: 'AMD FX FX 8370E',
      target: 'CPU',
    },
    {
      id: 'cpu-a10-6800b',
      slug: 'amd-a-a10-6800b',
      normalizedName: normalizeHardwareName('AMD A-Series A10 6800B'),
      name: 'AMD A-Series A10 6800B',
      target: 'CPU',
    },
    {
      id: 'gpu-4070',
      slug: 'nvidia-geforce-rtx-4070',
      normalizedName: normalizeHardwareName('NVIDIA GeForce RTX 4070'),
      name: 'NVIDIA GeForce RTX 4070',
      target: 'GPU',
      aliases: ['RTX 4070'],
    },
    {
      id: 'gpu-2080-maxq',
      slug: 'nvidia-geforce-rtx-2080-max-q',
      normalizedName: normalizeHardwareName('NVIDIA GeForce RTX 2080 Max-Q'),
      name: 'NVIDIA GeForce RTX 2080 Max-Q',
      target: 'GPU',
    },
    {
      id: 'gpu-1080-mobile',
      slug: 'nvidia-geforce-gtx-1080-mobile',
      normalizedName: normalizeHardwareName('NVIDIA GeForce GTX 1080 Mobile'),
      name: 'NVIDIA GeForce GTX 1080 Mobile',
      target: 'GPU',
    },
    {
      id: 'gpu-4060-ti-8',
      slug: 'nvidia-geforce-rtx-4060-ti-8-gb',
      normalizedName: normalizeHardwareName('NVIDIA GeForce RTX 4060 Ti 8 GB'),
      name: 'NVIDIA GeForce RTX 4060 Ti 8 GB',
      target: 'GPU',
    },
    {
      id: 'gpu-4060-ti-16',
      slug: 'nvidia-geforce-rtx-4060-ti-16-gb',
      normalizedName: normalizeHardwareName('NVIDIA GeForce RTX 4060 Ti 16 GB'),
      name: 'NVIDIA GeForce RTX 4060 Ti 16 GB',
      target: 'GPU',
    },
  ];

  it('normalizes PassMark processor noise without removing model suffixes', () => {
    expect(normalizeHardwareName('AMD Ryzen 7 7800X3D 8-Core Processor')).toBe(
      normalizeHardwareName('AMD Ryzen 7 7800X3D'),
    );
    expect(normalizeHardwareName('AMD Ryzen 7 7800X3D')).not.toBe(
      normalizeHardwareName('AMD Ryzen 7 7800X'),
    );
    expect(normalizeHardwareName('Intel Core i5-6200U @ 2.30GHz')).toBe(
      normalizeHardwareName('Intel Core i5-6200U'),
    );
    expect(normalizeHardwareName('GeForce RTX 3060 12GB')).toBe(
      normalizeHardwareName('GeForce RTX 3060 12 GB'),
    );
    expect(normalizeHardwareName('AMD FX-8350 Eight-Core')).toBe(
      normalizeHardwareName('AMD FX-8350'),
    );
    expect(normalizeHardwareName('Intel Core2 Duo E8400 @ 3.00GHz')).toBe(
      normalizeHardwareName('Intel Core 2 Duo E8400'),
    );
    expect(normalizeHardwareName('AMD Athlon 64 X2 Dual Core 5600+')).toBe(
      normalizeHardwareName('AMD Athlon 64 X2 5600+'),
    );
  });

  it('resolves safe vendor variants', () => {
    const cpu = new HardwareResolver(hardware, 'CPU');
    expect(cpu.resolve('Ryzen 7 7800X3D').hardware?.id).toBe('cpu-x3d');
    expect(cpu.resolve('AMD Phenom 8650 Triple-Core').hardware?.id).toBe(
      'cpu-phenom-x3',
    );
    expect(cpu.resolve('AMD FX-8370E Eight-Core').hardware?.id).toBe(
      'cpu-fx-8370e',
    );
    expect(cpu.resolve('AMD A10-6800B APU').hardware?.id).toBe('cpu-a10-6800b');

    const gpu = new HardwareResolver(hardware, 'GPU');
    expect(gpu.resolve('NVIDIA GeForce RTX 4070').hardware?.id).toBe(
      'gpu-4070',
    );
    expect(gpu.resolve('GeForce RTX 2080 with Max-Q Design').hardware?.id).toBe(
      'gpu-2080-maxq',
    );
    expect(gpu.resolve('GeForce GTX 1080 (Mobile)').hardware?.id).toBe(
      'gpu-1080-mobile',
    );
  });

  it('does not collapse a suffixed model into its base model', () => {
    const gpu = new HardwareResolver(hardware, 'GPU');
    expect(gpu.resolve('RTX 4070 Ti').hardware).toBeNull();
  });
});

describe('default VRAM PassMark GPU assignment', () => {
  it('assigns a bare PassMark SKU to the single remaining catalog VRAM variant', async () => {
    const { assignDefaultVramGpuMatches } =
      await import('./sources/passmark-crawler');
    const catalog = [
      {
        id: 'gpu-4060-ti-8',
        slug: 'nvidia-geforce-rtx-4060-ti-8-gb',
        normalizedName: normalizeHardwareName(
          'NVIDIA GeForce RTX 4060 Ti 8 GB',
        ),
        name: 'NVIDIA GeForce RTX 4060 Ti 8 GB',
        target: 'GPU' as const,
      },
      {
        id: 'gpu-4060-ti-16',
        slug: 'nvidia-geforce-rtx-4060-ti-16-gb',
        normalizedName: normalizeHardwareName(
          'NVIDIA GeForce RTX 4060 Ti 16 GB',
        ),
        name: 'NVIDIA GeForce RTX 4060 Ti 16 GB',
        target: 'GPU' as const,
      },
    ];
    const bare = {
      source: 'passmark' as const,
      benchmark: 'passmark-g3d-mark' as const,
      sourceUrl,
      capturedAt,
      hardwareName: 'GeForce RTX 4060 Ti',
      score: 20000,
      unit: 'points',
    };
    const sixteen = {
      ...bare,
      hardwareName: 'GeForce RTX 4060 Ti 16GB',
      score: 22584,
    };
    const resolved = new Map([
      ['nvidia-geforce-rtx-4060-ti-16-gb:passmark-g3d-mark', sixteen],
    ]);
    assignDefaultVramGpuMatches(catalog, [bare, sixteen], resolved);
    expect(
      resolved.get('nvidia-geforce-rtx-4060-ti-8-gb:passmark-g3d-mark')
        ?.hardwareName,
    ).toBe('NVIDIA GeForce RTX 4060 Ti 8 GB');
    expect(
      resolved.get('nvidia-geforce-rtx-4060-ti-8-gb:passmark-g3d-mark')?.score,
    ).toBe(20000);
  });
});

describe('benchmark validation', () => {
  it.each([
    [12345, 12345],
    ['12345', 12345],
    [0, null],
    [-123, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    ['12,345', null],
  ])('validates score %p', (input, expected) => {
    expect(parsePositiveScore(input)).toBe(expected);
  });

  it('rejects a unit that does not match the benchmark', () => {
    expect(
      validateRawBenchmarkRecord({
        source: 'passmark',
        benchmark: 'passmark-cpu-mark',
        sourceUrl,
        capturedAt,
        hardwareName: 'AMD Ryzen 7 7800X3D',
        score: 12345,
        unit: 'fps',
        rawPayload: {},
      }).error,
    ).toContain('incompatible');
  });
});

describe('PassMark parsers', () => {
  it('parses CPU Mark and G3D list rows', () => {
    const html =
      '<table><tr><td><a>AMD Ryzen 7 7800X3D</a></td><td>34,210</td><td>17</td><td>NA</td></tr></table>';
    expect(parsePassMarkCpuMark(html, sourceUrl, capturedAt)[0]).toMatchObject({
      hardwareName: 'AMD Ryzen 7 7800X3D',
      score: 34210,
      rank: 17,
    });
    expect(parsePassMarkG3d(html, sourceUrl, capturedAt)[0]).toMatchObject({
      benchmark: 'passmark-g3d-mark',
      score: 34210,
    });
  });

  it('parses single-thread chart rows', () => {
    const html =
      '<li id="rk42"><a><span class="prdname">AMD Ryzen 7 7800X3D</span><span class="count">3,756</span></a></li>';
    expect(
      parsePassMarkSingleThread(html, sourceUrl, capturedAt)[0],
    ).toMatchObject({ score: 3756, rank: 42 });
  });

  it('parses CPU and GPU detail evidence with sample counts', () => {
    const cpuHtml =
      '<h1>Intel Core i5-6200U @ 2.30GHz</h1> Average CPU Mark Multithread Rating 2,993 Single Thread Rating 1,535 Samples: 9,169';
    expect(
      parsePassMarkCpuDetail(cpuHtml, sourceUrl, capturedAt),
    ).toMatchObject([
      { benchmark: 'passmark-cpu-mark', score: 2993, sampleCount: 9169 },
      {
        benchmark: 'passmark-single-thread',
        score: 1535,
        sampleCount: 9169,
      },
    ]);

    const gpuHtml =
      '<h1>GeForce RTX 4070 Benchmark</h1> Average G3D Mark 27,000 Average G2D Mark: 900 Samples: 1,234';
    expect(
      parsePassMarkGpuDetail(gpuHtml, sourceUrl, capturedAt)[0],
    ).toMatchObject({
      hardwareName: 'GeForce RTX 4070',
      score: 27000,
      sampleCount: 1234,
    });
  });
});

describe('import idempotency decision', () => {
  const row = {
    score: 12345,
    sampleCount: 10,
    sourceUrl,
    capturedAt,
  } satisfies Pick<
    ValidatedBenchmarkRecord,
    'score' | 'sampleCount' | 'sourceUrl' | 'capturedAt'
  >;

  it('inserts once and skips the same evidence on replay', () => {
    expect(decideScoreWrite(null, row)).toBe('inserted');
    expect(
      decideScoreWrite(
        {
          score: row.score,
          sampleCount: row.sampleCount,
          sourceUrl: row.sourceUrl,
          capturedAt: new Date(row.capturedAt),
        },
        row,
      ),
    ).toBe('skipped');
  });

  it('updates only newer changed evidence', () => {
    expect(
      decideScoreWrite(
        {
          score: 12000,
          sampleCount: null,
          sourceUrl,
          capturedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        row,
      ),
    ).toBe('updated');
  });

  it('prefers a clock-qualified PassMark row at equal capture time', () => {
    const bare = {
      hardwareName: 'Intel Core i9-9900K',
      capturedAt,
      score: 2128,
    };
    const canonical = {
      hardwareName: 'Intel Core i9-9900K @ 3.60GHz',
      capturedAt,
      score: 18033,
    };
    expect(sortImportRecords([bare, canonical])).toEqual([canonical, bare]);
  });
});

describe('benchmark importer replay', () => {
  it('creates one canonical score when the same file is imported twice', async () => {
    let score:
      | {
          id: string;
          score: number;
          sampleCount: number | null;
          sourceUrl: string;
          capturedAt: Date;
        }
      | undefined;
    let sequence = 0;
    const createId = (prefix: string) => `${prefix}-${++sequence}`;
    const prisma = {
      importBatch: {
        create: async () => ({ id: createId('batch') }),
        update: async () => ({}),
      },
      importRecord: {
        create: async () => ({ id: createId('record') }),
        update: async () => ({}),
      },
      cpu: {
        findMany: async () => [
          {
            id: 'cpu-x3d',
            slug: 'amd-ryzen-7-7800x3d',
            normalizedName: normalizeHardwareName('AMD Ryzen 7 7800X3D'),
            name: 'AMD Ryzen 7 7800X3D',
            aliases: [{ alias: 'ryzen 7 7800x3d' }],
          },
        ],
      },
      gpu: { findMany: async () => [] },
      benchmark: {
        findUnique: async () => ({ id: 'benchmark-cpu-mark', target: 'CPU' }),
      },
      cpuBenchmarkScore: {
        findUnique: async () => score ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          score = {
            id: 'score-1',
            score: data.score as number,
            sampleCount: (data.sampleCount as number | undefined) ?? null,
            sourceUrl: data.sourceUrl as string,
            capturedAt: data.capturedAt as Date,
          };
          return score;
        },
        update: async () => score,
      },
      gpuBenchmarkScore: {
        findUnique: async () => null,
        create: async () => {
          throw new Error('Unexpected GPU write');
        },
        update: async () => {
          throw new Error('Unexpected GPU write');
        },
      },
    } as unknown as PrismaClient;
    const raw = {
      source: 'passmark',
      benchmark: 'passmark-cpu-mark',
      sourceUrl,
      capturedAt,
      hardwareName: 'AMD Ryzen 7 7800X3D',
      score: 12345,
      unit: 'points',
      rawPayload: { row: 1 },
    };
    const importer = new BenchmarkImporter(prisma);

    expect(await importer.import([raw])).toMatchObject({ inserted: 1 });
    expect(await importer.import([raw])).toMatchObject({ skipped: 1 });
    expect(score?.id).toBe('score-1');
  });
});
