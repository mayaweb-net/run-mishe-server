import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { CpuMatrixQueryDto } from './dto/cpu-matrix-query.dto';
import { CpuService } from './cpu.service';

const MATRIX_BENCHMARK_SLUGS = [
  'passmark-cpu-mark',
  'passmark-single-thread',
] as const;

const MATRIX_BENCHMARK_LABELS: Record<
  (typeof MATRIX_BENCHMARK_SLUGS)[number],
  string
> = {
  'passmark-cpu-mark': 'PassMark CPU Mark',
  'passmark-single-thread': 'PassMark Single Thread',
};

@Injectable()
export class CpuMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cpuService: CpuService,
  ) {}

  async getMatrix(query: CpuMatrixQueryDto) {
    const listQuery = {
      ...query,
      page: query.page || 1,
      limit: query.limit || 25,
      sortBy: query.sortBy || 'gamingIndex',
      sortOrder: query.sortOrder || 'desc',
    };

    const page = await this.cpuService.list(listQuery);
    const cpus = page.items;

    const columns = MATRIX_BENCHMARK_SLUGS.map((slug) => ({
      id: slug,
      slug,
      name: MATRIX_BENCHMARK_LABELS[slug],
      nameFa: null as string | null,
    }));

    if (cpus.length === 0) {
      return {
        mode: 'benchmark' as const,
        meta: page.meta,
        columns,
        rows: [] as Array<{
          cpu: (typeof cpus)[number];
          values: Array<number | null>;
        }>,
      };
    }

    const scores = await this.prisma.cpuBenchmarkScore.findMany({
      where: {
        cpuId: { in: cpus.map((cpu) => cpu.id) },
        benchmark: { slug: { in: [...MATRIX_BENCHMARK_SLUGS] } },
      },
      select: {
        cpuId: true,
        score: true,
        sampleCount: true,
        capturedAt: true,
        benchmark: { select: { slug: true } },
      },
      orderBy: [{ sampleCount: 'desc' }, { capturedAt: 'desc' }],
    });

    const bestByCpuSlug = new Map<string, number>();
    for (const row of scores) {
      const key = `${row.cpuId}:${row.benchmark.slug}`;
      if (!bestByCpuSlug.has(key)) {
        bestByCpuSlug.set(key, row.score);
      }
    }

    return {
      mode: 'benchmark' as const,
      meta: page.meta,
      columns,
      rows: cpus.map((cpu) => ({
        cpu,
        values: MATRIX_BENCHMARK_SLUGS.map(
          (slug) => bestByCpuSlug.get(`${cpu.id}:${slug}`) ?? null,
        ),
      })),
    };
  }
}
