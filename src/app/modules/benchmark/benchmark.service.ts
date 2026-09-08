import { Injectable } from '@nestjs/common';
import { Prisma } from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import { ListBenchmarkQueryDto } from './dto/list-benchmark-query.dto';
import { ListBenchmarkScoreQueryDto } from './dto/list-benchmark-score-query.dto';

const benchmarkListSelect = {
  id: true,
  slug: true,
  name: true,
  vendor: true,
  target: true,
  category: true,
  version: true,
  unit: true,
  higherIsBetter: true,
  weightInIndex: true,
  isActive: true,
  description: true,
  sourceUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BenchmarkSelect;

export type BenchmarkListItem = Prisma.BenchmarkGetPayload<{
  select: typeof benchmarkListSelect;
}>;

@Injectable()
export class BenchmarkService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions(query: ListBenchmarkQueryDto) {
    const where = this.buildDefinitionWhere(query);
    const orderBy = this.buildDefinitionOrderBy(query);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.benchmark.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        select: benchmarkListSelect,
      }),
      this.prisma.benchmark.count({ where }),
    ]);

    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async listCpuScores(query: ListBenchmarkScoreQueryDto) {
    const where = this.buildCpuScoreWhere(query);
    const orderBy = this.buildScoreOrderBy(query, 'cpu');
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cpuBenchmarkScore.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        select: {
          id: true,
          score: true,
          sampleCount: true,
          source: true,
          sourceUrl: true,
          capturedAt: true,
          createdAt: true,
          cpu: { select: { id: true, slug: true, name: true } },
          benchmark: {
            select: { id: true, slug: true, name: true, vendor: true },
          },
        },
      }),
      this.prisma.cpuBenchmarkScore.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      score: row.score,
      sampleCount: row.sampleCount,
      source: row.source,
      sourceUrl: row.sourceUrl,
      capturedAt: row.capturedAt,
      createdAt: row.createdAt,
      hardware: row.cpu,
      benchmark: row.benchmark,
    }));

    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async listGpuScores(query: ListBenchmarkScoreQueryDto) {
    const where = this.buildGpuScoreWhere(query);
    const orderBy = this.buildScoreOrderBy(query, 'gpu');
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.gpuBenchmarkScore.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        select: {
          id: true,
          score: true,
          sampleCount: true,
          source: true,
          sourceUrl: true,
          capturedAt: true,
          createdAt: true,
          gpu: { select: { id: true, slug: true, name: true } },
          benchmark: {
            select: { id: true, slug: true, name: true, vendor: true },
          },
        },
      }),
      this.prisma.gpuBenchmarkScore.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      score: row.score,
      sampleCount: row.sampleCount,
      source: row.source,
      sourceUrl: row.sourceUrl,
      capturedAt: row.capturedAt,
      createdAt: row.createdAt,
      hardware: row.gpu,
      benchmark: row.benchmark,
    }));

    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  private buildDefinitionWhere(
    query: ListBenchmarkQueryDto,
  ): Prisma.BenchmarkWhereInput {
    const where: Prisma.BenchmarkWhereInput = {};

    if (query.target) where.target = query.target;
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { vendor: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildDefinitionOrderBy(
    query: ListBenchmarkQueryDto,
  ): Prisma.BenchmarkOrderByWithRelationInput {
    return { [query.sortBy]: query.sortOrder };
  }

  private buildCpuScoreWhere(
    query: ListBenchmarkScoreQueryDto,
  ): Prisma.CpuBenchmarkScoreWhereInput {
    const where: Prisma.CpuBenchmarkScoreWhereInput = {};
    if (query.source) where.source = query.source;
    if (query.benchmarkSlug) {
      where.benchmark = { slug: query.benchmarkSlug };
    }

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { cpu: { name: { contains: q, mode: 'insensitive' } } },
        { cpu: { slug: { contains: q, mode: 'insensitive' } } },
        { benchmark: { name: { contains: q, mode: 'insensitive' } } },
        { benchmark: { slug: { contains: q, mode: 'insensitive' } } },
        { source: { contains: q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildGpuScoreWhere(
    query: ListBenchmarkScoreQueryDto,
  ): Prisma.GpuBenchmarkScoreWhereInput {
    const where: Prisma.GpuBenchmarkScoreWhereInput = {};
    if (query.source) where.source = query.source;
    if (query.benchmarkSlug) {
      where.benchmark = { slug: query.benchmarkSlug };
    }

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { gpu: { name: { contains: q, mode: 'insensitive' } } },
        { gpu: { slug: { contains: q, mode: 'insensitive' } } },
        { benchmark: { name: { contains: q, mode: 'insensitive' } } },
        { benchmark: { slug: { contains: q, mode: 'insensitive' } } },
        { source: { contains: q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildScoreOrderBy(
    query: ListBenchmarkScoreQueryDto,
    kind: 'cpu' | 'gpu',
  ):
    | Prisma.CpuBenchmarkScoreOrderByWithRelationInput
    | Prisma.GpuBenchmarkScoreOrderByWithRelationInput {
    const direction = query.sortOrder;
    switch (query.sortBy) {
      case 'hardwareName':
        return kind === 'cpu'
          ? { cpu: { name: direction } }
          : { gpu: { name: direction } };
      case 'benchmarkName':
        return { benchmark: { name: direction } };
      case 'source':
        return { source: direction };
      case 'capturedAt':
        return { capturedAt: direction };
      case 'score':
      default:
        return { score: direction };
    }
  }
}
