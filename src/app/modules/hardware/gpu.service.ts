import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import {
  normalizeHardwareName,
  slugifyHardwareName,
} from '@/app/common/hardware/normalize-hardware-name';
import { ListGpuQueryDto } from './dto/list-gpu-query.dto';
import { CreateGpuDto } from './dto/create-gpu.dto';
import { UpdateGpuDto } from './dto/update-gpu.dto';

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

export const gpuDetailSelect = {
  id: true,
  slug: true,
  normalizedName: true,
  name: true,
  vendor: true,
  family: true,
  series: true,
  generation: true,
  architecture: true,
  codename: true,
  chip: true,
  releaseDate: true,
  shadingUnits: true,
  tmus: true,
  rops: true,
  tensorCores: true,
  rayTracingCores: true,
  baseClockMhz: true,
  boostClockMhz: true,
  gameClockMhz: true,
  memoryClockMhz: true,
  vramGb: true,
  memoryType: true,
  memoryBusBits: true,
  bandwidthGbps: true,
  busInterface: true,
  pcieVersion: true,
  pcieLanes: true,
  tdpWatt: true,
  recommendedPsuW: true,
  formFactor: true,
  isWorkstation: true,
  supportsRayTracing: true,
  dlssVersion: true,
  fsrVersion: true,
  supportsXess: true,
  supportsFrameGen: true,
  supportsMultiFrameGen: true,
  supportsAv1Encode: true,
  supportsAv1Decode: true,
  supportsCuda: true,
  directxVersion: true,
  vulkanVersion: true,
  openglVersion: true,
  maxDisplays: true,
  gamingIndex: true,
  computeIndex: true,
  indexCalculatedAt: true,
  msrpUsd: true,
  quality: true,
  sourceName: true,
  sourceUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GpuSelect;

export type GpuListItem = Prisma.GpuGetPayload<{ select: typeof gpuListSelect }>;
export type GpuDetail = Prisma.GpuGetPayload<{ select: typeof gpuDetailSelect }>;

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

  async findById(id: string): Promise<GpuDetail> {
    const gpu = await this.prisma.gpu.findUnique({
      where: { id },
      select: gpuDetailSelect,
    });

    if (!gpu) {
      throw new NotFoundException(`GPU with id "${id}" not found`);
    }

    return gpu;
  }

  async create(dto: CreateGpuDto): Promise<GpuDetail> {
    const slug = dto.slug?.trim() || slugifyHardwareName(dto.name);
    const normalizedName = normalizeHardwareName(dto.name);

    return this.prisma.gpu.create({
      data: {
        name: dto.name,
        slug,
        normalizedName,
        vendor: dto.vendor,
        family: dto.family,
        series: dto.series,
        generation: dto.generation,
        architecture: dto.architecture,
        codename: dto.codename,
        chip: dto.chip,
        releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : undefined,
        shadingUnits: dto.shadingUnits,
        baseClockMhz: dto.baseClockMhz,
        boostClockMhz: dto.boostClockMhz,
        vramGb: dto.vramGb,
        memoryType: dto.memoryType,
        memoryBusBits: dto.memoryBusBits,
        bandwidthGbps: dto.bandwidthGbps,
        tdpWatt: dto.tdpWatt,
        recommendedPsuW: dto.recommendedPsuW,
        formFactor: dto.formFactor,
        isWorkstation: dto.isWorkstation,
        supportsRayTracing: dto.supportsRayTracing,
        msrpUsd: dto.msrpUsd,
        quality: dto.quality,
        sourceName: dto.sourceName,
        sourceUrl: dto.sourceUrl,
      },
      select: gpuDetailSelect,
    });
  }

  async update(id: string, dto: UpdateGpuDto): Promise<GpuDetail> {
    await this.findById(id);

    const data: Prisma.GpuUpdateInput = {
      ...dto,
      releaseDate:
        dto.releaseDate === undefined
          ? undefined
          : dto.releaseDate
            ? new Date(dto.releaseDate)
            : null,
    };

    if (dto.name !== undefined) {
      data.normalizedName = normalizeHardwareName(dto.name);
    }

    if (dto.slug !== undefined) {
      data.slug = dto.slug;
    } else if (dto.name !== undefined && dto.slug === undefined) {
      data.slug = slugifyHardwareName(dto.name);
    }

    return this.prisma.gpu.update({
      where: { id },
      data,
      select: gpuDetailSelect,
    });
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.findById(id);
    await this.prisma.gpu.delete({ where: { id } });
    return { id };
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
