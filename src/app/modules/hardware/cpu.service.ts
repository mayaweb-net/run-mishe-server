import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import {
  normalizeHardwareName,
  slugifyHardwareName,
} from '@/app/common/hardware/normalize-hardware-name';
import { ListCpuQueryDto } from './dto/list-cpu-query.dto';
import { CreateCpuDto } from './dto/create-cpu.dto';
import { UpdateCpuDto } from './dto/update-cpu.dto';

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

export const cpuDetailSelect = {
  id: true,
  slug: true,
  normalizedName: true,
  name: true,
  vendor: true,
  family: true,
  series: true,
  generation: true,
  codename: true,
  architecture: true,
  socket: true,
  releaseDate: true,
  performanceCores: true,
  efficiencyCores: true,
  threads: true,
  baseClockMhz: true,
  boostClockMhz: true,
  l2CacheMb: true,
  l3CacheMb: true,
  tdpWatt: true,
  maxTempC: true,
  processNodeNm: true,
  formFactor: true,
  isUnlocked: true,
  isX3d: true,
  memoryTypes: true,
  memoryChannels: true,
  maxMemoryGb: true,
  pcieVersion: true,
  pcieLanes: true,
  instructionSets: true,
  singleThreadIndex: true,
  multiThreadIndex: true,
  gamingIndex: true,
  indexCalculatedAt: true,
  msrpUsd: true,
  quality: true,
  sourceName: true,
  sourceUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CpuSelect;

export type CpuListItem = Prisma.CpuGetPayload<{ select: typeof cpuListSelect }>;
export type CpuDetail = Prisma.CpuGetPayload<{ select: typeof cpuDetailSelect }>;

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

  async findById(id: string): Promise<CpuDetail> {
    const cpu = await this.prisma.cpu.findUnique({
      where: { id },
      select: cpuDetailSelect,
    });

    if (!cpu) {
      throw new NotFoundException(`CPU with id "${id}" not found`);
    }

    return cpu;
  }

  async create(dto: CreateCpuDto): Promise<CpuDetail> {
    const slug = dto.slug?.trim() || slugifyHardwareName(dto.name);
    const normalizedName = normalizeHardwareName(dto.name);

    return this.prisma.cpu.create({
      data: {
        name: dto.name,
        slug,
        normalizedName,
        vendor: dto.vendor,
        family: dto.family,
        series: dto.series,
        generation: dto.generation,
        codename: dto.codename,
        architecture: dto.architecture,
        socket: dto.socket,
        releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : undefined,
        performanceCores: dto.performanceCores,
        efficiencyCores: dto.efficiencyCores ?? 0,
        threads: dto.threads,
        baseClockMhz: dto.baseClockMhz,
        boostClockMhz: dto.boostClockMhz,
        l2CacheMb: dto.l2CacheMb,
        l3CacheMb: dto.l3CacheMb,
        tdpWatt: dto.tdpWatt,
        maxTempC: dto.maxTempC,
        processNodeNm: dto.processNodeNm,
        formFactor: dto.formFactor,
        isUnlocked: dto.isUnlocked,
        isX3d: dto.isX3d,
        memoryTypes: dto.memoryTypes ?? [],
        memoryChannels: dto.memoryChannels,
        maxMemoryGb: dto.maxMemoryGb,
        pcieVersion: dto.pcieVersion,
        pcieLanes: dto.pcieLanes,
        instructionSets: dto.instructionSets ?? [],
        msrpUsd: dto.msrpUsd,
        quality: dto.quality,
        sourceName: dto.sourceName,
        sourceUrl: dto.sourceUrl,
      },
      select: cpuDetailSelect,
    });
  }

  async update(id: string, dto: UpdateCpuDto): Promise<CpuDetail> {
    await this.findById(id);

    const data: Prisma.CpuUpdateInput = {
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

    return this.prisma.cpu.update({
      where: { id },
      data,
      select: cpuDetailSelect,
    });
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.findById(id);
    await this.prisma.cpu.delete({ where: { id } });
    return { id };
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
