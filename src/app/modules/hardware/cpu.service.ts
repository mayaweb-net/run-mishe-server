import { Injectable } from '@nestjs/common';
import { Prisma } from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import { ListCpuQueryDto } from './dto/list-cpu-query.dto';

const cpuListSelect = {
  id: true,
  slug: true,
  name: true,
  vendor: true,
  family: true,
  series: true,
  generation: true,
  formFactor: true,
  performanceCores: true,
  efficiencyCores: true,
  threads: true,
  gamingIndex: true,
  quality: true,
  releaseDate: true,
  createdAt: true,
} satisfies Prisma.CpuSelect;

export type CpuListItem = Prisma.CpuGetPayload<{ select: typeof cpuListSelect }>;

@Injectable()
export class CpuService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCpuQueryDto) {
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cpu.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        select: cpuListSelect,
      }),
      this.prisma.cpu.count({ where }),
    ]);

    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  private buildWhere(query: ListCpuQueryDto): Prisma.CpuWhereInput {
    const where: Prisma.CpuWhereInput = {};

    if (query.vendor) {
      where.vendor = query.vendor;
    }

    if (query.formFactor) {
      where.formFactor = query.formFactor;
    }

    if (query.quality) {
      where.quality = query.quality;
    }

    const search = query.q?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { normalizedName: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        {
          aliases: {
            some: {
              alias: { contains: search.toLowerCase(), mode: 'insensitive' },
            },
          },
        },
      ];
    }

    return where;
  }

  private buildOrderBy(
    query: ListCpuQueryDto,
  ): Prisma.CpuOrderByWithRelationInput {
    const direction = query.sortOrder;

    switch (query.sortBy) {
      case 'gamingIndex':
        return { gamingIndex: direction };
      case 'createdAt':
        return { createdAt: direction };
      case 'releaseDate':
        return { releaseDate: direction };
      default:
        return { name: direction };
    }
  }
}
