import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  QualityPreset,
  ScreenResolution,
} from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import {
  normalizeHardwareName,
  slugifyHardwareName,
} from '@/app/common/hardware/normalize-hardware-name';
import {
  orderByIds,
  searchGpuIdsByTrigram,
} from '@/app/common/search/trigram-search';
import { ListGpuQueryDto } from './dto/list-gpu-query.dto';
import { CreateGpuDto } from './dto/create-gpu.dto';
import { UpdateGpuDto } from './dto/update-gpu.dto';

const QUALITY_PRESETS = [
  QualityPreset.LOW,
  QualityPreset.MEDIUM,
  QualityPreset.HIGH,
  QualityPreset.ULTRA,
] as const;

const RESOLUTION_RANK: Record<ScreenResolution, number> = {
  [ScreenResolution.R1080P]: 0,
  [ScreenResolution.R1440P]: 1,
  [ScreenResolution.R720P]: 2,
  [ScreenResolution.R2160P]: 3,
  [ScreenResolution.UW1440P]: 4,
  [ScreenResolution.UW2160P]: 5,
};

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
  supportsRayTracing: true,
  dlssVersion: true,
  fsrVersion: true,
  supportsFrameGen: true,
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
  coverUrl: true,
  description: true,
  content: true,
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

const gpuPublicDetailSelect = {
  ...gpuDetailSelect,
  benchmarkScores: {
    orderBy: [{ score: 'desc' as const }],
    select: {
      id: true,
      score: true,
      minScore: true,
      maxScore: true,
      sampleCount: true,
      source: true,
      sourceUrl: true,
      capturedAt: true,
      benchmark: {
        select: {
          id: true,
          slug: true,
          name: true,
          vendor: true,
          category: true,
          unit: true,
          higherIsBetter: true,
        },
      },
    },
  },
} satisfies Prisma.GpuSelect;

export type GpuListItem = Prisma.GpuGetPayload<{ select: typeof gpuListSelect }>;
export type GpuDetail = Prisma.GpuGetPayload<{ select: typeof gpuDetailSelect }>;
export type GpuPublicDetailBase = Prisma.GpuGetPayload<{
  select: typeof gpuPublicDetailSelect;
}>;

export type GpuGamePerformancePresetFps = Record<
  (typeof QUALITY_PRESETS)[number],
  number | null
>;

export type GpuGamePerformance = {
  game: {
    id: string;
    slug: string;
    name: string;
    nameFa: string | null;
    coverUrl: string | null;
  };
  resolution: ScreenResolution | null;
  presets: GpuGamePerformancePresetFps;
};

export type GpuPublicDetail = GpuPublicDetailBase & {
  gamePerformance: GpuGamePerformance[];
};

@Injectable()
export class GpuService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListGpuQueryDto) {
    const search = query.q?.trim();
    const skip = (query.page - 1) * query.limit;
    const hasExtendedFilters = this.hasExtendedFilters(query);

    if (search && !hasExtendedFilters) {
      const { ids, total } = await searchGpuIdsByTrigram(this.prisma, search, {
        limit: query.limit,
        offset: skip,
        vendor: query.vendor,
        formFactor: query.formFactor,
        quality: query.quality,
      });

      if (ids.length === 0) {
        return buildPaginatedResult([], total, query.page, query.limit);
      }

      const rows = await this.prisma.gpu.findMany({
        where: { id: { in: ids } },
        select: gpuListSelect,
      });

      return buildPaginatedResult(
        orderByIds(rows, ids),
        total,
        query.page,
        query.limit,
      );
    }

    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);

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

  async findBySlug(slug: string): Promise<GpuPublicDetail> {
    const gpu = await this.prisma.gpu.findUnique({
      where: { slug },
      select: gpuPublicDetailSelect,
    });

    if (!gpu) {
      throw new NotFoundException(`GPU with slug "${slug}" not found`);
    }

    const gamePerformance = await this.buildGamePerformance(gpu.id);

    return { ...gpu, gamePerformance };
  }

  async create(dto: CreateGpuDto): Promise<GpuDetail> {
    const slug = dto.slug?.trim() || slugifyHardwareName(dto.name);
    const normalizedName = normalizeHardwareName(dto.name);

    return this.prisma.gpu.create({
      data: {
        ...(dto.id ? { id: dto.id } : {}),
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
        coverUrl: dto.coverUrl,
        description: dto.description,
        content: dto.content,
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

  private async buildGamePerformance(
    gpuId: string,
  ): Promise<GpuGamePerformance[]> {
    const curated = await this.prisma.curatedTopGame.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        game: {
          select: {
            id: true,
            slug: true,
            name: true,
            nameFa: true,
            coverUrl: true,
          },
        },
      },
    });

    if (curated.length === 0) {
      return [];
    }

    const gameIds = curated.map((row) => row.game.id);
    const samples = await this.prisma.fpsSample.findMany({
      where: {
        gpuId,
        gameId: { in: gameIds },
      },
      select: {
        gameId: true,
        preset: true,
        resolution: true,
        avgFps: true,
      },
    });

    type BestSample = {
      avgFps: number;
      resolution: ScreenResolution;
      rank: number;
    };

    const best = new Map<string, BestSample>();
    for (const sample of samples) {
      const key = `${sample.gameId}:${sample.preset}`;
      const rank = RESOLUTION_RANK[sample.resolution] ?? 99;
      const prev = best.get(key);
      if (
        !prev ||
        rank < prev.rank ||
        (rank === prev.rank && sample.avgFps > prev.avgFps)
      ) {
        best.set(key, {
          avgFps: sample.avgFps,
          resolution: sample.resolution,
          rank,
        });
      }
    }

    return curated.map(({ game }) => {
      const presets = {
        [QualityPreset.LOW]: null,
        [QualityPreset.MEDIUM]: null,
        [QualityPreset.HIGH]: null,
        [QualityPreset.ULTRA]: null,
      } as GpuGamePerformancePresetFps;

      let resolution: ScreenResolution | null = null;
      let bestRank = Number.POSITIVE_INFINITY;

      for (const preset of QUALITY_PRESETS) {
        const hit = best.get(`${game.id}:${preset}`);
        if (!hit) continue;
        presets[preset] = Math.round(hit.avgFps);
        if (hit.rank < bestRank) {
          bestRank = hit.rank;
          resolution = hit.resolution;
        }
      }

      return { game, resolution, presets };
    });
  }

  private hasExtendedFilters(query: ListGpuQueryDto): boolean {
    return (
      query.vramMin != null ||
      query.vramMax != null ||
      Boolean(query.family?.trim()) ||
      query.generation != null ||
      query.supportsRayTracing != null ||
      query.dlssMin != null ||
      query.supportsFrameGen != null ||
      Boolean(query.memoryType?.trim())
    );
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

    if (query.vramMin != null || query.vramMax != null) {
      where.vramGb = {
        ...(query.vramMin != null ? { gte: query.vramMin } : {}),
        ...(query.vramMax != null ? { lte: query.vramMax } : {}),
      };
    }

    if (query.family?.trim()) {
      where.family = query.family.trim();
    }

    if (query.generation != null) {
      where.generation = query.generation;
    }

    if (query.supportsRayTracing != null) {
      where.supportsRayTracing = query.supportsRayTracing;
    }

    if (query.dlssMin != null) {
      where.dlssVersion = { gte: query.dlssMin };
    }

    if (query.supportsFrameGen != null) {
      where.supportsFrameGen = query.supportsFrameGen;
    }

    if (query.memoryType?.trim()) {
      where.memoryType = {
        equals: query.memoryType.trim(),
        mode: 'insensitive',
      };
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
