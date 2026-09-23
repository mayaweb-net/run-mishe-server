import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckKind,
  Prisma,
  QualityPreset,
  RequirementTier,
  ScreenResolution,
  Upscaler,
  type DemandTier,
} from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { RedisService } from '@/app/db/redis/redis.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import { ListDefaultScalingQueryDto } from './dto/list-default-scaling-query.dto';
import { ListFpsSampleQueryDto } from './dto/list-fps-sample-query.dto';
import { CreateFpsSamplesDto } from './dto/create-fps-samples.dto';
import { UpdateFpsSampleDto } from './dto/update-fps-sample.dto';
import { FpsEstimateDto } from './dto/fps-estimate.dto';
import { BottleneckDto } from './dto/bottleneck.dto';
import { RunCheckDto } from './dto/run-check.dto';
import { fpsDedupeKey } from './fps-ingest/fps-importer';
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
import {
  compareIndex,
  compareRam,
  compareVram,
  performanceCopy,
  resolveVerdict,
  tierPasses,
  verdictStatusLabelFa,
} from './run-check';
import { randomBytes } from 'node:crypto';

const defaultScalingSelect = {
  id: true,
  resolution: true,
  preset: true,
  upscaler: true,
  rayTracing: true,
  multiplier: true,
  note: true,
} satisfies Prisma.DefaultScalingSelect;

const fpsSampleSelect = {
  id: true,
  resolution: true,
  preset: true,
  upscaler: true,
  rayTracing: true,
  frameGen: true,
  ramGb: true,
  avgFps: true,
  onePercentLow: true,
  minFps: true,
  maxFps: true,
  source: true,
  sourceUrl: true,
  confidence: true,
  capturedAt: true,
  createdAt: true,
  game: { select: { id: true, slug: true, name: true } },
  gpu: { select: { id: true, slug: true, name: true } },
  cpu: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.FpsSampleSelect;

const CACHE_TTL_SECONDS = 60 * 60 * 24;

type TierRequirement = {
  cpuIndex: number | null;
  gpuIndex: number | null;
  cpuName: string | null;
  gpuName: string | null;
  rawCpuText: string | null;
  rawGpuText: string | null;
  ramGb: number | null;
  vramGb: number | null;
};

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

export type BottleneckLimitedBy = 'CPU' | 'GPU';

export interface BottleneckResponse {
  engineVersion: number;
  method: 'parts-balance';
  warnings: string[];
  limitedBy: BottleneckLimitedBy;
  percent: number;
  label: string;
  suggestions: [];
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
  ramGb: number;
  shareCode: string;
  sharePath: string;
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

  async listFpsSamples(query: ListFpsSampleQueryDto) {
    const where: Prisma.FpsSampleWhereInput = {};
    if (query.gameId) where.gameId = query.gameId;
    if (query.gpuId) where.gpuId = query.gpuId;
    if (query.source) where.source = query.source;
    if (query.resolution) where.resolution = query.resolution;
    if (query.preset) where.preset = query.preset;
    if (query.hasOnePercentLow === 1) where.onePercentLow = { not: null };
    if (query.hasOnePercentLow === 0) where.onePercentLow = null;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { game: { name: { contains: q, mode: 'insensitive' } } },
        { game: { slug: { contains: q, mode: 'insensitive' } } },
        { gpu: { name: { contains: q, mode: 'insensitive' } } },
        { cpu: { name: { contains: q, mode: 'insensitive' } } },
        { source: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.FpsSampleOrderByWithRelationInput =
      query.sortBy === 'gameName'
        ? { game: { name: query.sortOrder } }
        : query.sortBy === 'gpuName'
          ? { gpu: { name: query.sortOrder } }
          : { [query.sortBy]: query.sortOrder };

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fpsSample.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        select: fpsSampleSelect,
      }),
      this.prisma.fpsSample.count({ where }),
    ]);

    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async createManualFpsSamples(dto: CreateFpsSamplesDto) {
    const [game, cpu, gpu] = await Promise.all([
      this.prisma.game.findUnique({
        where: { id: dto.gameId },
        select: { id: true },
      }),
      this.prisma.cpu.findUnique({
        where: { id: dto.cpuId },
        select: { id: true },
      }),
      this.prisma.gpu.findUnique({
        where: { id: dto.gpuId },
        select: { id: true },
      }),
    ]);
    if (!game) throw new NotFoundException(`Game ${dto.gameId} not found`);
    if (!cpu) throw new NotFoundException(`CPU ${dto.cpuId} not found`);
    if (!gpu) throw new NotFoundException(`GPU ${dto.gpuId} not found`);

    const source = dto.source?.trim() || 'manual';
    const sourceUrl = dto.sourceUrl?.trim() || '';
    const confidence = dto.confidence ?? 0.9;
    const capturedAt = new Date();

    let created = 0;
    let updated = 0;
    const items = [];

    for (const entry of dto.entries) {
      const upscaler = entry.upscaler ?? Upscaler.NONE;
      const rayTracing = entry.rayTracing ?? false;
      const frameGen = entry.frameGen ?? false;
      const dedupeKey = fpsDedupeKey({
        gameId: dto.gameId,
        gpuId: dto.gpuId,
        cpuId: dto.cpuId,
        resolution: entry.resolution,
        preset: entry.preset,
        upscaler,
        rayTracing,
        frameGen,
        source,
        sourceUrl,
      });

      const data = {
        gameId: dto.gameId,
        gpuId: dto.gpuId,
        cpuId: dto.cpuId,
        resolution: entry.resolution,
        preset: entry.preset,
        upscaler,
        rayTracing,
        frameGen,
        ramGb: entry.ramGb ?? null,
        avgFps: entry.avgFps,
        onePercentLow: entry.onePercentLow ?? null,
        source,
        sourceUrl: sourceUrl || null,
        confidence,
        capturedAt,
        dedupeKey,
      };

      const existing = await this.prisma.fpsSample.findUnique({
        where: { dedupeKey },
        select: { id: true },
      });

      const row = existing
        ? await this.prisma.fpsSample.update({
            where: { id: existing.id },
            data: {
              avgFps: data.avgFps,
              onePercentLow: data.onePercentLow,
              ramGb: data.ramGb,
              confidence: data.confidence,
              capturedAt: data.capturedAt,
              sourceUrl: data.sourceUrl,
            },
            select: fpsSampleSelect,
          })
        : await this.prisma.fpsSample.create({
            data,
            select: fpsSampleSelect,
          });

      if (existing) updated += 1;
      else created += 1;
      items.push(row);
    }

    return { items, created, updated, source };
  }

  async updateFpsSample(id: string, dto: UpdateFpsSampleDto) {
    const existing = await this.prisma.fpsSample.findUnique({
      where: { id },
      select: {
        id: true,
        gameId: true,
        gpuId: true,
        cpuId: true,
        resolution: true,
        preset: true,
        upscaler: true,
        rayTracing: true,
        frameGen: true,
        source: true,
        sourceUrl: true,
      },
    });
    if (!existing) throw new NotFoundException(`FpsSample ${id} not found`);

    const next = {
      gameId: dto.gameId ?? existing.gameId,
      gpuId: dto.gpuId ?? existing.gpuId,
      cpuId: dto.cpuId ?? existing.cpuId,
      resolution: dto.resolution ?? existing.resolution,
      preset: dto.preset ?? existing.preset,
      upscaler: dto.upscaler ?? existing.upscaler,
      rayTracing: dto.rayTracing ?? existing.rayTracing,
      frameGen: dto.frameGen ?? existing.frameGen,
      source: dto.source ?? existing.source,
      sourceUrl:
        dto.sourceUrl !== undefined
          ? dto.sourceUrl
          : existing.sourceUrl,
    };

    if (dto.gameId) {
      const game = await this.prisma.game.findUnique({
        where: { id: dto.gameId },
        select: { id: true },
      });
      if (!game) throw new NotFoundException(`Game ${dto.gameId} not found`);
    }
    if (dto.cpuId) {
      const cpu = await this.prisma.cpu.findUnique({
        where: { id: dto.cpuId },
        select: { id: true },
      });
      if (!cpu) throw new NotFoundException(`CPU ${dto.cpuId} not found`);
    }
    if (dto.gpuId) {
      const gpu = await this.prisma.gpu.findUnique({
        where: { id: dto.gpuId },
        select: { id: true },
      });
      if (!gpu) throw new NotFoundException(`GPU ${dto.gpuId} not found`);
    }

    const dedupeKey = fpsDedupeKey({
      gameId: next.gameId,
      gpuId: next.gpuId,
      cpuId: next.cpuId,
      resolution: next.resolution,
      preset: next.preset,
      upscaler: next.upscaler,
      rayTracing: next.rayTracing,
      frameGen: next.frameGen,
      source: next.source,
      sourceUrl: next.sourceUrl ?? '',
    });

    const clash = await this.prisma.fpsSample.findFirst({
      where: { dedupeKey, id: { not: id } },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException(
        'نمونهٔ دیگری با همین ترکیب بازی/سخت‌افزار/تنظیمات وجود دارد.',
      );
    }

    return this.prisma.fpsSample.update({
      where: { id },
      data: {
        gameId: next.gameId,
        gpuId: next.gpuId,
        cpuId: next.cpuId,
        resolution: next.resolution,
        preset: next.preset,
        upscaler: next.upscaler,
        rayTracing: next.rayTracing,
        frameGen: next.frameGen,
        source: next.source,
        sourceUrl: next.sourceUrl,
        dedupeKey,
        ...(dto.avgFps !== undefined ? { avgFps: dto.avgFps } : {}),
        ...(dto.onePercentLow !== undefined
          ? { onePercentLow: dto.onePercentLow }
          : {}),
        ...(dto.ramGb !== undefined ? { ramGb: dto.ramGb } : {}),
        ...(dto.confidence !== undefined ? { confidence: dto.confidence } : {}),
      },
      select: fpsSampleSelect,
    });
  }

  async deleteFpsSample(id: string) {
    const existing = await this.prisma.fpsSample.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`FpsSample ${id} not found`);
    await this.prisma.fpsSample.delete({ where: { id } });
    return { id };
  }

  async runCheck(dto: RunCheckDto) {
    const game = await this.resolveGame(dto);
    const cpu = await this.resolveCpu(dto);
    const gpu = await this.resolveGpu(dto);

    const [minimum, recommended] = await Promise.all([
      this.loadTierRequirement(game.id, RequirementTier.MINIMUM),
      this.loadTierRequirement(game.id, RequirementTier.RECOMMENDED),
    ]);

    const warnings: string[] = [];
    if (!minimum) {
      warnings.push('حداقل سیستم برای این بازی در دیتابیس ثبت نشده است.');
    }
    if (!recommended) {
      warnings.push('سیستم پیشنهادی برای این بازی در دیتابیس ثبت نشده است.');
    }
    if (cpu.gamingIndex == null) {
      warnings.push(`CPU «${cpu.name}» شاخص gamingIndex ندارد.`);
    }
    if (gpu.gamingIndex == null) {
      warnings.push(`GPU «${gpu.name}» شاخص gamingIndex ندارد.`);
    }

    const buildComponents = (tier: TierRequirement | null) => {
      const cpuStatus = compareIndex({
        userIndex: cpu.gamingIndex,
        requiredIndex: tier?.cpuIndex ?? null,
      });
      const gpuStatus = compareIndex({
        userIndex: gpu.gamingIndex,
        requiredIndex: tier?.gpuIndex ?? null,
      });
      const ramStatus = compareRam({
        userValue: dto.ramGb,
        required: tier?.ramGb ?? null,
      });
      const vramStatus = compareVram({
        userValue: gpu.vramGb,
        required: tier?.vramGb ?? null,
      });
      return {
        cpu: {
          status: cpuStatus,
          userIndex: cpu.gamingIndex,
          requiredIndex: tier?.cpuIndex ?? null,
          label: tier?.cpuName ?? tier?.rawCpuText ?? null,
        },
        gpu: {
          status: gpuStatus,
          userIndex: gpu.gamingIndex,
          requiredIndex: tier?.gpuIndex ?? null,
          label: tier?.gpuName ?? tier?.rawGpuText ?? null,
        },
        ram: {
          status: ramStatus,
          userValue: dto.ramGb,
          required: tier?.ramGb ?? null,
        },
        vram: {
          status: vramStatus,
          userValue: gpu.vramGb,
          required: tier?.vramGb ?? null,
        },
      };
    };

    const minComponents = buildComponents(minimum);
    const recComponents = buildComponents(recommended);

    const minimumPass = tierPasses({
      cpu: minComponents.cpu.status,
      gpu: minComponents.gpu.status,
      ram: minComponents.ram.status,
    });
    const recommendedPass = tierPasses({
      cpu: recComponents.cpu.status,
      gpu: recComponents.gpu.status,
      ram: recComponents.ram.status,
    });

    const verdict = resolveVerdict({ minimumPass, recommendedPass });
    const runs = verdict !== 'BELOW_MINIMUM';

    let fps1080High: number | null = null;
    if (cpu.gamingIndex != null && gpu.gamingIndex != null) {
      try {
        const estimate = await this.estimateFps({
          gameId: game.id,
          cpuId: cpu.id,
          gpuId: gpu.id,
          ramGb: dto.ramGb,
          preset: QualityPreset.HIGH,
          resolutions: [ScreenResolution.R1080P],
        });
        fps1080High = estimate.results[0]?.fps ?? null;
      } catch (error) {
        this.logger.warn(
          `run-check FPS hint failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const copy = performanceCopy({ verdict, fps1080High });
    const toTierView = (
      title: string,
      tier: TierRequirement | null,
      components: ReturnType<typeof buildComponents>,
      passed: boolean,
    ) => ({
      title,
      cpu: components.cpu.label ?? '—',
      gpu: components.gpu.label ?? '—',
      ram:
        tier?.ramGb != null ? `${tier.ramGb} GB` : '—',
      passed,
      cpuPassed: components.cpu.status === 'pass' || components.cpu.status === 'unknown',
      gpuPassed: components.gpu.status === 'pass' || components.gpu.status === 'unknown',
      ramPassed: components.ram.status === 'pass' || components.ram.status === 'unknown',
      cpuStatus: components.cpu.status,
      gpuStatus: components.gpu.status,
      ramStatus: components.ram.status,
      vramStatus: components.vram.status,
    });

    const result = {
      engineVersion: ESTIMATION_ENGINE_VERSION,
      verdict,
      runs,
      statusLabel: verdictStatusLabelFa(verdict),
      warnings,
      game: {
        id: game.id,
        slug: game.slug,
        name: game.name,
        coverUrl: game.coverUrl,
      },
      userSpec: {
        cpu: cpu.name,
        gpu: gpu.name,
        ram: String(dto.ramGb),
        cpuId: cpu.id,
        gpuId: gpu.id,
      },
      components: {
        minimum: minComponents,
        recommended: recComponents,
      },
      minimum: toTierView(
        'حداقل سیستم مورد نیاز',
        minimum,
        minComponents,
        minimumPass,
      ),
      recommended: toTierView(
        'سیستم پیشنهادی',
        recommended,
        recComponents,
        recommendedPass,
      ),
      performanceSummary: copy.summary,
      performanceDetail: copy.detail,
      expectedPerformance:
        fps1080High != null
          ? {
              resolution: 'R1080P' as const,
              preset: 'HIGH' as const,
              fps: fps1080High,
            }
          : null,
    };

    const publicCode = await this.createCheckSnapshot({
      kind: CheckKind.RUN_CHECK,
      gameId: game.id,
      cpuId: cpu.id,
      gpuId: gpu.id,
      ramGb: dto.ramGb,
      inputJson: {
        gameId: game.id,
        cpuId: cpu.id,
        gpuId: gpu.id,
        ramGb: dto.ramGb,
      },
      resultJson: result,
    });

    return {
      ...result,
      shareCode: publicCode,
      sharePath: `/c/${publicCode}`,
    };
  }

  async getCheckSnapshot(publicCode: string) {
    const row = await this.prisma.checkSnapshot.findUnique({
      where: { publicCode },
      select: {
        id: true,
        publicCode: true,
        kind: true,
        engineVersion: true,
        resultJson: true,
        inputJson: true,
        createdAt: true,
        viewCount: true,
        game: { select: { id: true, slug: true, name: true, coverUrl: true } },
        cpu: { select: { id: true, name: true } },
        gpu: { select: { id: true, name: true } },
        ramGb: true,
      },
    });
    if (!row) throw new NotFoundException('Check snapshot not found');

    await this.prisma.checkSnapshot.update({
      where: { id: row.id },
      data: { viewCount: { increment: 1 } },
    });

    return {
      publicCode: row.publicCode,
      kind: row.kind,
      engineVersion: row.engineVersion,
      createdAt: row.createdAt,
      viewCount: row.viewCount + 1,
      game: row.game,
      cpu: row.cpu,
      gpu: row.gpu,
      ramGb: row.ramGb,
      input: row.inputJson,
      result: row.resultJson,
      sharePath: `/c/${row.publicCode}`,
    };
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

    const profileRow = await this.prisma.gameProfile.findUnique({
      where: { gameId: game.id },
    });

    const isCalibrated = profileRow?.isCalibrated ?? false;
    const confidence = confidenceFromCalibration({
      isCalibrated,
      rSquared: profileRow?.rSquared,
      sampleCount: profileRow?.sampleCount ?? 0,
    });

    // Cache after we know calibration state so post-calibrate writes aren't masked.
    const cacheKey = [
      `est:v${ESTIMATION_ENGINE_VERSION}`,
      `cal:${isCalibrated ? profileRow?.calibrationVersion ?? 0 : 0}`,
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

    const anchors = await this.loadRecommendedAnchors(game.id);
    let method: EstimateMethod;
    let profile: Coefficients;
    let recCpuInferred = false;

    if (isCalibrated && profileRow) {
      // Prefer FpsSample-fitted GameProfile when calibration succeeded.
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

  async bottleneck(dto: BottleneckDto): Promise<BottleneckResponse> {
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

    // Single reference point (1080p HIGH). No resolution matrix — bottleneck is
    // a parts-pair balance, not a per-res game estimate.
    const preset = QualityPreset.HIGH;
    const resolution = ScreenResolution.R1080P;
    const demandTier: DemandTier = 'MEDIUM';
    const profile = coldStartCoefficients(demandTier);
    const scalingRows = {
      gameRows: [] as Awaited<
        ReturnType<EstimationService['loadScalingRows']>
      >['gameRows'],
      defaultRows: await this.prisma.defaultScaling.findMany({
        where: { resolution, preset },
        select: {
          resolution: true,
          preset: true,
          upscaler: true,
          rayTracing: true,
          multiplier: true,
        },
      }),
    };
    const scaling = this.pickScalingMultiplier(
      scalingRows,
      resolution,
      preset,
      Upscaler.NONE,
      false,
    );
    const estimate = estimateFps({
      gpuIndex: gpu.gamingIndex,
      cpuIndex: cpu.gamingIndex,
      vramGb: gpu.vramGb ?? 0,
      ramGb: dto.ramGb,
      resolution: resolution as EstResolution,
      preset,
      upscaler: 'NONE',
      rayTracing: false,
      profile,
      scaling,
      vramNeedGb: coldVramNeedGb(demandTier, resolution as EstResolution, preset),
      ramNeedGb: COLD_RAM_NEED_GB[demandTier],
      confidence: 'low',
    });

    const warnings: string[] = [
      'تعادل دو قطعه بر اساس gamingIndex است؛ به بازی و رزولوشن وابسته نیست.',
    ];
    if (gpu.vramGb == null) {
      warnings.push('VRAM کارت مشخص نیست.');
    }

    const responseBody = {
      engineVersion: ESTIMATION_ENGINE_VERSION,
      method: 'parts-balance' as const,
      warnings,
      limitedBy: estimate.limitedBy,
      percent: estimate.bottleneckPercent,
      label: bottleneckLabelFa(estimate.bottleneckPercent),
      suggestions: [] as [],
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
      ramGb: dto.ramGb,
    };

    const publicCode = await this.createCheckSnapshot({
      kind: CheckKind.BOTTLENECK,
      gameId: null,
      cpuId: cpu.id,
      gpuId: gpu.id,
      ramGb: dto.ramGb,
      inputJson: {
        cpuId: cpu.id,
        gpuId: gpu.id,
        ramGb: dto.ramGb,
      },
      resultJson: responseBody,
    });

    return {
      ...responseBody,
      shareCode: publicCode,
      sharePath: `/c/${publicCode}`,
    };
  }

  private async loadTierRequirement(
    gameId: string,
    tier: RequirementTier,
  ): Promise<TierRequirement | null> {
    const requirement = await this.prisma.gameRequirement.findUnique({
      where: { gameId_tier: { gameId, tier } },
      select: {
        rawCpuText: true,
        rawGpuText: true,
        ramGb: true,
        vramGb: true,
        options: {
          where: {
            OR: [
              { kind: 'CPU', cpuId: { not: null } },
              { kind: 'GPU', gpuId: { not: null } },
            ],
          },
          select: {
            kind: true,
            matchedText: true,
            matchScore: true,
            cpu: { select: { name: true, gamingIndex: true } },
            gpu: { select: { name: true, gamingIndex: true } },
          },
        },
      },
    });
    if (!requirement) return null;

    const cpuOptions = requirement.options.filter((o) => o.kind === 'CPU');
    const gpuOptions = requirement.options.filter((o) => o.kind === 'GPU');
    const bestCpu = [...cpuOptions].sort(
      (a, b) => (b.cpu?.gamingIndex ?? -1) - (a.cpu?.gamingIndex ?? -1),
    )[0];
    const bestGpu = [...gpuOptions].sort(
      (a, b) => (b.gpu?.gamingIndex ?? -1) - (a.gpu?.gamingIndex ?? -1),
    )[0];

    return {
      cpuIndex: maxGamingIndex(
        cpuOptions.map((o) => o.cpu?.gamingIndex ?? null),
      ),
      gpuIndex: maxGamingIndex(
        gpuOptions.map((o) => o.gpu?.gamingIndex ?? null),
      ),
      cpuName: bestCpu?.cpu?.name ?? null,
      gpuName: bestGpu?.gpu?.name ?? null,
      rawCpuText: requirement.rawCpuText,
      rawGpuText: requirement.rawGpuText,
      ramGb: requirement.ramGb,
      vramGb: requirement.vramGb,
    };
  }

  private async createCheckSnapshot(input: {
    kind: CheckKind;
    gameId: string | null;
    cpuId: string;
    gpuId: string;
    ramGb: number;
    inputJson: Prisma.InputJsonValue;
    resultJson: Prisma.InputJsonValue;
  }): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const publicCode = randomBytes(5).toString('base64url').slice(0, 8);
      try {
        await this.prisma.checkSnapshot.create({
          data: {
            publicCode,
            kind: input.kind,
            gameId: input.gameId,
            cpuId: input.cpuId,
            gpuId: input.gpuId,
            ramGb: input.ramGb,
            inputJson: input.inputJson,
            resultJson: input.resultJson,
            engineVersion: ESTIMATION_ENGINE_VERSION,
          },
        });
        return publicCode;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException('Could not allocate a unique share code');
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
