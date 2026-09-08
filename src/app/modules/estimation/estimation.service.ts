import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  QualityPreset,
  ScreenResolution,
  Upscaler,
  type DemandTier,
} from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { RedisService } from '@/app/db/redis/redis.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import { ListDefaultScalingQueryDto } from './dto/list-default-scaling-query.dto';
import { FpsEstimateDto } from './dto/fps-estimate.dto';
import {
  COLD_RAM_NEED_GB,
  DEFAULT_ESTIMATE_RESOLUTIONS,
  ESTIMATION_ENGINE_VERSION,
  RT_FACTOR,
  UPSCALER_FACTOR,
  coldStartCoefficients,
  coldVramNeedGb,
  confidenceFromCalibration,
  confidenceLabelFa,
  type Coefficients,
  type ConfidenceLevel,
  type EstimateMethod,
  type ScreenResolution as EstResolution,
  type Upscaler as EstUpscaler,
} from './estimation.constants';
import { maxGamingIndex } from './demand-tier';
import {
  bottleneckLabelFa,
  estimateFps,
  inferRecCpuIndexFromGpu,
  relativeCoefficientsFromRecommended,
  type EstimateOutput,
} from './estimation.engine';

const defaultScalingSelect = {
  id: true,
  resolution: true,
  preset: true,
  upscaler: true,
  rayTracing: true,
  multiplier: true,
  note: true,
} satisfies Prisma.DefaultScalingSelect;

const CACHE_TTL_SECONDS = 60 * 60 * 24;

export interface FpsEstimateResolutionResult extends EstimateOutput {
  resolution: ScreenResolution;
  bottleneckLabel: string;
}

export interface FpsEstimateResponse {
  engineVersion: number;
  confidence: ConfidenceLevel;
  confidenceLabel: string;
  isCalibrated: boolean;
  /** How cold-start / profile coefficients were chosen. */
  method: EstimateMethod;
  anchors: {
    recGpuIndex: number | null;
    recCpuIndex: number | null;
    recCpuInferred: boolean;
  };
  preset: QualityPreset;
  upscaler: Upscaler;
  rayTracing: boolean;
  ramGb: number;
  warnings: string[];
  game: {
    id: string;
    slug: string;
    name: string;
    demandTier: DemandTier;
    coverUrl: string | null;
  };
  cpu: {
    id: string;
    slug: string;
    name: string;
    gamingIndex: number;
  };
  gpu: {
    id: string;
    slug: string;
    name: string;
    gamingIndex: number;
    vramGb: number | null;
  };
  results: FpsEstimateResolutionResult[];
}

@Injectable()
export class EstimationService {
  private readonly logger = new Logger(EstimationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

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

  async estimateFps(dto: FpsEstimateDto): Promise<FpsEstimateResponse> {
    const game = await this.resolveGame(dto);
    const cpu = await this.resolveCpu(dto);
    const gpu = await this.resolveGpu(dto);

    if (cpu.gamingIndex == null) {
      throw new BadRequestException(
        `CPU "${cpu.name}" has no gamingIndex — run pnpm index:hardware`,
      );
    }
    if (gpu.gamingIndex == null) {
      throw new BadRequestException(
        `GPU "${gpu.name}" has no gamingIndex — run pnpm index:hardware`,
      );
    }

    const preset = dto.preset ?? QualityPreset.HIGH;
    const upscaler = dto.upscaler ?? Upscaler.NONE;
    const rayTracing = dto.rayTracing ?? false;
    const resolutions =
      dto.resolutions?.length ? dto.resolutions : DEFAULT_ESTIMATE_RESOLUTIONS;

    const cacheKey = [
      `est:v${ESTIMATION_ENGINE_VERSION}`,
      game.id,
      game.demandTier,
      gpu.id,
      cpu.id,
      dto.ramGb,
      resolutions.join(','),
      preset,
      upscaler,
      rayTracing ? '1' : '0',
    ].join(':');

    const cached = await this.readCache(cacheKey);
    if (cached) return cached;

    const warnings: string[] = [];
    const upscalerWarning = this.upscalerSupportWarning(gpu, upscaler);
    if (upscalerWarning) warnings.push(upscalerWarning);

    const profileRow = await this.prisma.gameProfile.findUnique({
      where: { gameId: game.id },
    });

    const isCalibrated = profileRow?.isCalibrated ?? false;
    const confidence = confidenceFromCalibration({
      isCalibrated,
      rSquared: profileRow?.rSquared,
      sampleCount: profileRow?.sampleCount ?? 0,
    });

    const anchors = await this.loadRecommendedAnchors(game.id);
    let method: EstimateMethod;
    let profile: Coefficients;
    let recCpuInferred = false;

    if (isCalibrated && profileRow) {
      method = 'calibrated';
      profile = {
        gpuCoef: profileRow.gpuCoef,
        gpuExponent: profileRow.gpuExponent,
        cpuCoef: profileRow.cpuCoef,
        cpuExponent: profileRow.cpuExponent,
        blendK: profileRow.blendK,
      };
    } else if (anchors.recGpuIndex != null) {
      method = 'relative-recommended';
      let recCpuIndex = anchors.recCpuIndex;
      if (recCpuIndex == null) {
        recCpuIndex = inferRecCpuIndexFromGpu(anchors.recGpuIndex);
        recCpuInferred = true;
        warnings.push(
          'CPU Recommended مچ نشده؛ لنگر CPU از روی GPU Recommended تخمین زده شد.',
        );
      }
      anchors.recCpuIndex = recCpuIndex;
      profile = relativeCoefficientsFromRecommended({
        recGpuIndex: anchors.recGpuIndex,
        recCpuIndex,
      });
    } else {
      method = 'demand-tier';
      profile = coldStartCoefficients(game.demandTier);
      warnings.push(
        'GPU Recommended مچ نشده؛ تخمین از demandTier (سطل‌بندی) است.',
      );
    }

    const ramNeedGb =
      isCalibrated && profileRow
        ? profileRow.ramNeedGb
        : COLD_RAM_NEED_GB[game.demandTier];

    const vramGb = gpu.vramGb ?? 0;
    if (gpu.vramGb == null) {
      warnings.push('VRAM کارت مشخص نیست؛ جریمهٔ حافظه بدون فرض ظرفیت محاسبه شد.');
    }

    const scalingRows = await this.loadScalingRows(game.id, resolutions, preset);
    const results: FpsEstimateResolutionResult[] = [];
    for (const resolution of resolutions) {
      const scaling = this.pickScalingMultiplier(
        scalingRows,
        resolution,
        preset,
        upscaler,
        rayTracing,
      );
      const vramNeedGb = this.resolveVramNeedGb(
        game.demandTier,
        resolution,
        preset,
        isCalibrated ? profileRow?.vramNeedGb : null,
      );

      const estimate = estimateFps({
        gpuIndex: gpu.gamingIndex,
        cpuIndex: cpu.gamingIndex,
        vramGb,
        ramGb: dto.ramGb,
        resolution: resolution as EstResolution,
        preset,
        upscaler: upscaler as EstUpscaler,
        rayTracing,
        profile,
        scaling,
        vramNeedGb,
        ramNeedGb,
        confidence,
      });

      results.push({
        resolution,
        ...estimate,
        bottleneckLabel: bottleneckLabelFa(estimate.bottleneckPercent),
      });
    }

    const response: FpsEstimateResponse = {
      engineVersion: ESTIMATION_ENGINE_VERSION,
      confidence,
      confidenceLabel: confidenceLabelFa(confidence),
      isCalibrated,
      method,
      anchors: {
        recGpuIndex: anchors.recGpuIndex,
        recCpuIndex: anchors.recCpuIndex,
        recCpuInferred,
      },
      preset,
      upscaler,
      rayTracing,
      ramGb: dto.ramGb,
      warnings,
      game: {
        id: game.id,
        slug: game.slug,
        name: game.name,
        demandTier: game.demandTier,
        coverUrl: game.coverUrl,
      },
      cpu: {
        id: cpu.id,
        slug: cpu.slug,
        name: cpu.name,
        gamingIndex: cpu.gamingIndex,
      },
      gpu: {
        id: gpu.id,
        slug: gpu.slug,
        name: gpu.name,
        gamingIndex: gpu.gamingIndex,
        vramGb: gpu.vramGb,
      },
      results,
    };

    await this.writeCache(cacheKey, response);
    return response;
  }

  private async loadRecommendedAnchors(gameId: string): Promise<{
    recGpuIndex: number | null;
    recCpuIndex: number | null;
  }> {
    const requirement = await this.prisma.gameRequirement.findUnique({
      where: {
        gameId_tier: { gameId, tier: 'RECOMMENDED' },
      },
      select: {
        options: {
          where: {
            OR: [
              { kind: 'GPU', gpuId: { not: null } },
              { kind: 'CPU', cpuId: { not: null } },
            ],
          },
          select: {
            kind: true,
            gpu: { select: { gamingIndex: true } },
            cpu: { select: { gamingIndex: true } },
          },
        },
      },
    });

    if (!requirement) return { recGpuIndex: null, recCpuIndex: null };

    const gpuIndexes = requirement.options
      .filter((option) => option.kind === 'GPU')
      .map((option) => option.gpu?.gamingIndex ?? null);
    const cpuIndexes = requirement.options
      .filter((option) => option.kind === 'CPU')
      .map((option) => option.cpu?.gamingIndex ?? null);

    return {
      recGpuIndex: maxGamingIndex(gpuIndexes),
      recCpuIndex: maxGamingIndex(cpuIndexes),
    };
  }

  private async loadScalingRows(
    gameId: string,
    resolutions: ScreenResolution[],
    preset: QualityPreset,
  ) {
    const [gameRows, defaultRows] = await Promise.all([
      this.prisma.gameScaling.findMany({
        where: { gameId, resolution: { in: resolutions }, preset },
        select: {
          resolution: true,
          preset: true,
          upscaler: true,
          rayTracing: true,
          multiplier: true,
        },
      }),
      this.prisma.defaultScaling.findMany({
        where: { resolution: { in: resolutions }, preset },
        select: {
          resolution: true,
          preset: true,
          upscaler: true,
          rayTracing: true,
          multiplier: true,
        },
      }),
    ]);
    return { gameRows, defaultRows };
  }

  private pickScalingMultiplier(
    rows: {
      gameRows: Array<{
        resolution: ScreenResolution;
        preset: QualityPreset;
        upscaler: Upscaler;
        rayTracing: boolean;
        multiplier: number;
      }>;
      defaultRows: Array<{
        resolution: ScreenResolution;
        preset: QualityPreset;
        upscaler: Upscaler;
        rayTracing: boolean;
        multiplier: number;
      }>;
    },
    resolution: ScreenResolution,
    preset: QualityPreset,
    upscaler: Upscaler,
    rayTracing: boolean,
  ): number {
    const match = (
      list: typeof rows.gameRows,
      u: Upscaler,
      rt: boolean,
    ) =>
      list.find(
        (row) =>
          row.resolution === resolution &&
          row.preset === preset &&
          row.upscaler === u &&
          row.rayTracing === rt,
      );

    const exact =
      match(rows.gameRows, upscaler, rayTracing) ??
      match(rows.defaultRows, upscaler, rayTracing);
    if (exact) return exact.multiplier;

    const base =
      match(rows.gameRows, Upscaler.NONE, false) ??
      match(rows.defaultRows, Upscaler.NONE, false);
    if (base == null) {
      throw new BadRequestException(
        `No DefaultScaling for ${resolution}/${preset} — run prisma db seed`,
      );
    }

    const upscalerFactor = UPSCALER_FACTOR[upscaler as EstUpscaler] ?? 1;
    const rtFactor = rayTracing ? RT_FACTOR : 1;
    return base.multiplier * upscalerFactor * rtFactor;
  }

  private resolveVramNeedGb(
    tier: DemandTier,
    resolution: ScreenResolution,
    preset: QualityPreset,
    profileVram: Prisma.JsonValue | null | undefined,
  ): number {
    if (profileVram && typeof profileVram === 'object' && !Array.isArray(profileVram)) {
      const byRes = (profileVram as Record<string, unknown>)[resolution];
      if (byRes && typeof byRes === 'object' && !Array.isArray(byRes)) {
        const value = (byRes as Record<string, unknown>)[preset];
        if (typeof value === 'number' && value > 0) return value;
      }
    }
    return coldVramNeedGb(tier, resolution as EstResolution, preset);
  }

  private upscalerSupportWarning(
    gpu: {
      name: string;
      dlssVersion: number | null;
      fsrVersion: number | null;
      supportsXess: boolean;
    },
    upscaler: Upscaler,
  ): string | null {
    if (upscaler === Upscaler.NONE) return null;
    if (upscaler.startsWith('DLSS') && !(gpu.dlssVersion != null && gpu.dlssVersion > 0)) {
      return `کارت ${gpu.name} از DLSS پشتیبانی نمی‌کند.`;
    }
    if (upscaler.startsWith('FSR') && !(gpu.fsrVersion != null && gpu.fsrVersion > 0)) {
      return `کارت ${gpu.name} از FSR پشتیبانی نمی‌کند.`;
    }
    if (upscaler.startsWith('XESS') && !gpu.supportsXess) {
      return `کارت ${gpu.name} از XeSS پشتیبانی نمی‌کند.`;
    }
    return null;
  }

  private async resolveGame(dto: FpsEstimateDto) {
    if (dto.gameId) {
      const row = await this.prisma.game.findUnique({
        where: { id: dto.gameId },
        select: {
          id: true,
          slug: true,
          name: true,
          demandTier: true,
          coverUrl: true,
        },
      });
      if (!row) throw new NotFoundException('Game not found');
      return row;
    }
    if (dto.gameSlug) {
      const row = await this.prisma.game.findUnique({
        where: { slug: dto.gameSlug },
        select: {
          id: true,
          slug: true,
          name: true,
          demandTier: true,
          coverUrl: true,
        },
      });
      if (!row) throw new NotFoundException(`Game slug not found: ${dto.gameSlug}`);
      return row;
    }
    const query = dto.gameQuery?.trim();
    if (!query) {
      throw new BadRequestException('Provide gameId, gameSlug, or gameQuery');
    }
    const row = await this.prisma.game.findFirst({
      where: {
        isPublished: true,
        OR: [
          { name: { equals: query, mode: 'insensitive' } },
          { slug: { equals: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        demandTier: true,
        coverUrl: true,
      },
    });
    if (row) return row;

    const fuzzy = await this.prisma.game.findFirst({
      where: {
        isPublished: true,
        OR: [
          { name: { startsWith: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { nameFa: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        demandTier: true,
        coverUrl: true,
      },
    });
    if (!fuzzy) throw new NotFoundException(`Game not found for query: ${query}`);
    return fuzzy;
  }

  private async resolveCpu(dto: FpsEstimateDto) {
    if (dto.cpuId) {
      const row = await this.prisma.cpu.findUnique({
        where: { id: dto.cpuId },
        select: { id: true, slug: true, name: true, gamingIndex: true },
      });
      if (!row) throw new NotFoundException('CPU not found');
      return row;
    }
    if (dto.cpuSlug) {
      const row = await this.prisma.cpu.findUnique({
        where: { slug: dto.cpuSlug },
        select: { id: true, slug: true, name: true, gamingIndex: true },
      });
      if (!row) throw new NotFoundException(`CPU slug not found: ${dto.cpuSlug}`);
      return row;
    }
    const query = dto.cpuQuery?.trim();
    if (!query) {
      throw new BadRequestException('Provide cpuId, cpuSlug, or cpuQuery');
    }
    const exact = await this.prisma.cpu.findFirst({
      where: {
        OR: [
          { name: { equals: query, mode: 'insensitive' } },
          { slug: { equals: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, slug: true, name: true, gamingIndex: true },
    });
    if (exact) return exact;

    const row = await this.prisma.cpu.findFirst({
      where: {
        OR: [
          { name: { startsWith: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true, gamingIndex: true },
    });
    if (!row) throw new NotFoundException(`CPU not found for query: ${query}`);
    return row;
  }

  private async resolveGpu(dto: FpsEstimateDto) {
    if (dto.gpuId) {
      const row = await this.prisma.gpu.findUnique({
        where: { id: dto.gpuId },
        select: {
          id: true,
          slug: true,
          name: true,
          gamingIndex: true,
          vramGb: true,
          dlssVersion: true,
          fsrVersion: true,
          supportsXess: true,
        },
      });
      if (!row) throw new NotFoundException('GPU not found');
      return row;
    }
    if (dto.gpuSlug) {
      const row = await this.prisma.gpu.findUnique({
        where: { slug: dto.gpuSlug },
        select: {
          id: true,
          slug: true,
          name: true,
          gamingIndex: true,
          vramGb: true,
          dlssVersion: true,
          fsrVersion: true,
          supportsXess: true,
        },
      });
      if (!row) throw new NotFoundException(`GPU slug not found: ${dto.gpuSlug}`);
      return row;
    }
    const query = dto.gpuQuery?.trim();
    if (!query) {
      throw new BadRequestException('Provide gpuId, gpuSlug, or gpuQuery');
    }
    const exact = await this.prisma.gpu.findFirst({
      where: {
        OR: [
          { name: { equals: query, mode: 'insensitive' } },
          { slug: { equals: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        gamingIndex: true,
        vramGb: true,
        dlssVersion: true,
        fsrVersion: true,
        supportsXess: true,
      },
    });
    if (exact) return exact;

    const row = await this.prisma.gpu.findFirst({
      where: {
        OR: [
          { name: { startsWith: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        gamingIndex: true,
        vramGb: true,
        dlssVersion: true,
        fsrVersion: true,
        supportsXess: true,
      },
    });
    if (!row) throw new NotFoundException(`GPU not found for query: ${query}`);
    return row;
  }

  private async readCache(key: string): Promise<FpsEstimateResponse | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as FpsEstimateResponse;
    } catch (error) {
      this.logger.warn(
        `FPS cache read failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  private async writeCache(
    key: string,
    value: FpsEstimateResponse,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(
        `FPS cache write failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
