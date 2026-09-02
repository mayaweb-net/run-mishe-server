import { Injectable } from '@nestjs/common';
import { Prisma } from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import { ListGpuQueryDto } from './dto/list-gpu-query.dto';

const gpuListSelect = {
  id: true,
  slug: true,
  name: true,
  vendor: true,
  family: true,
  series: true,
  generation: true,
  formFactor: true,
  vramGb: true,
  memoryType: true,
  tdpWatt: true,
  gamingIndex: true,
  quality: true,
  releaseDate: true,
  createdAt: true,
} satisfies Prisma.GpuSelect;

export type GpuListItem = Prisma.GpuGetPayload<{ select: typeof gpuListSelect }>;

@Injectable()
export class GpuService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListGpuQueryDto) {
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.gpu.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        select: gpuListSelect,
      }),
      this.prisma.gpu.count({ where }),
    ]);

    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  private buildWhere(query: ListGpuQueryDto): Prisma.GpuWhereInput {
    const where: Prisma.GpuWhereInput = {};

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
    query: ListGpuQueryDto,
  ): Prisma.GpuOrderByWithRelationInput {
    const direction = query.sortOrder;

    switch (query.sortBy) {
      case 'gamingIndex':
        return { gamingIndex: direction };
      case 'createdAt':
        return { createdAt: direction };
      case 'releaseDate':
        return { releaseDate: direction };
      case 'vramGb':
        return { vramGb: direction };
      default:
        return { name: direction };
    }
  }
}
