import { Injectable } from '@nestjs/common';
import { Prisma } from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import { ListDefaultScalingQueryDto } from './dto/list-default-scaling-query.dto';

const defaultScalingSelect = {
  id: true,
  resolution: true,
  preset: true,
  upscaler: true,
  rayTracing: true,
  multiplier: true,
  note: true,
} satisfies Prisma.DefaultScalingSelect;

@Injectable()
export class EstimationService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefaultScalings(query: ListDefaultScalingQueryDto) {
    const where: Prisma.DefaultScalingWhereInput = {};
    if (query.resolution) where.resolution = query.resolution;
    if (query.preset) where.preset = query.preset;

    const orderBy: Prisma.DefaultScalingOrderByWithRelationInput = {
      [query.sortBy]: query.sortOrder,
    };
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.defaultScaling.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        select: defaultScalingSelect,
      }),
      this.prisma.defaultScaling.count({ where }),
    ]);

    return buildPaginatedResult(items, total, query.page, query.limit);
  }
}
