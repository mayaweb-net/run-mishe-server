import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FormFactor,
  QualityPreset,
  ScreenResolution,
} from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { EstimationService } from '@/app/modules/estimation/estimation.service';
import { GpuMatrixQueryDto } from './dto/gpu-matrix-query.dto';
import { GpuService } from './gpu.service';

const MATRIX_BENCHMARK_SLUGS = [
  'passmark-g3d-mark',
  'gpuark-gpi',
  '3dmark-time-spy',
] as const;

const MATRIX_BENCHMARK_LABELS: Record<(typeof MATRIX_BENCHMARK_SLUGS)[number], string> = {
  'passmark-g3d-mark': 'PassMark G3D',
  'gpuark-gpi': 'GPU Ark GPI',
  '3dmark-time-spy': '3DMark Time Spy',
};

@Injectable()
export class GpuMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gpuService: GpuService,
    private readonly estimationService: EstimationService,
  ) {}

  async getMatrix(query: GpuMatrixQueryDto) {
    const mode = query.mode ?? 'fps';
    const listQuery = {
      ...query,
      page: query.page || 1,
      limit: query.limit || 25,
      sortBy: query.sortBy || 'gamingIndex',
      sortOrder: query.sortOrder || 'desc',
    };

    const page = await this.gpuService.list(listQuery);
    const gpus = page.items;

    if (mode === 'benchmark') {
      return this.benchmarkMatrix(page.meta, gpus);
    }

    return this.fpsMatrix(query, page.meta, gpus);
  }

  private async fpsMatrix(
    query: GpuMatrixQueryDto,
    meta: { page: number; limit: number; total: number; totalPages: number },
    gpus: Array<{
      id: string;
      slug: string;
      name: string;
      vendor: string;
      family: string | null;
      series: string | null;
      generation: number | null;
      formFactor: string;
      vramGb: number | null;
      memoryType: string | null;
      tdpWatt: number | null;
      gamingIndex: number | null;
      supportsRayTracing: boolean;
      dlssVersion: number | null;
      fsrVersion: number | null;
      supportsFrameGen: boolean;
    }>,
  ) {
    const cpu = await this.resolveReferenceCpu(query.cpuId);
    const resolution = query.resolution ?? ScreenResolution.R1080P;
    const preset = query.preset ?? QualityPreset.HIGH;
    const ramGb = query.ramGb ?? 16;

    const indexedGpus = gpus.filter(
      (gpu): gpu is typeof gpu & { gamingIndex: number } =>
        gpu.gamingIndex != null,
    );

    const matrix = await this.estimationService.fpsMatrix({
      cpu: {
        id: cpu.id,
        gamingIndex: cpu.gamingIndex,
      },
      gpus: indexedGpus.map((gpu) => ({
        id: gpu.id,
        gamingIndex: gpu.gamingIndex,
        vramGb: gpu.vramGb,
      })),
      resolution,
      preset,
      ramGb,
    });

    const valuesByGpuId = new Map(
      matrix.rows.map((row) => [row.gpuId, row.values]),
    );
    const emptyValues = matrix.columns.map(() => null);

    return {
      mode: 'fps' as const,
      meta,
      cpu: {
        id: cpu.id,
        slug: cpu.slug,
        name: cpu.name,
        gamingIndex: cpu.gamingIndex,
      },
      settings: { resolution, preset, ramGb },
      columns: matrix.columns,
      rows: gpus.map((gpu) => ({
        gpu,
        values: valuesByGpuId.get(gpu.id) ?? emptyValues,
      })),
    };
  }

  private async benchmarkMatrix(
    meta: { page: number; limit: number; total: number; totalPages: number },
    gpus: Array<{
      id: string;
      slug: string;
      name: string;
      vendor: string;
      family: string | null;
      series: string | null;
      generation: number | null;
      formFactor: string;
      vramGb: number | null;
      memoryType: string | null;
      tdpWatt: number | null;
      gamingIndex: number | null;
      supportsRayTracing: boolean;
      dlssVersion: number | null;
      fsrVersion: number | null;
      supportsFrameGen: boolean;
    }>,
  ) {
    const columns = MATRIX_BENCHMARK_SLUGS.map((slug) => ({
      id: slug,
      slug,
      name: MATRIX_BENCHMARK_LABELS[slug],
      nameFa: null as string | null,
    }));

    if (gpus.length === 0) {
      return {
        mode: 'benchmark' as const,
        meta,
        cpu: null,
        settings: null,
        columns,
        rows: [] as Array<{ gpu: (typeof gpus)[number]; values: Array<number | null> }>,
      };
    }

    const scores = await this.prisma.gpuBenchmarkScore.findMany({
      where: {
        gpuId: { in: gpus.map((gpu) => gpu.id) },
        benchmark: { slug: { in: [...MATRIX_BENCHMARK_SLUGS] } },
      },
      select: {
        gpuId: true,
        score: true,
        sampleCount: true,
        capturedAt: true,
        benchmark: { select: { slug: true } },
      },
      orderBy: [{ sampleCount: 'desc' }, { capturedAt: 'desc' }],
    });

    const bestByGpuSlug = new Map<string, number>();
    for (const row of scores) {
      const key = `${row.gpuId}:${row.benchmark.slug}`;
      if (!bestByGpuSlug.has(key)) {
        bestByGpuSlug.set(key, row.score);
      }
    }

    return {
      mode: 'benchmark' as const,
      meta,
      cpu: null,
      settings: null,
      columns,
      rows: gpus.map((gpu) => ({
        gpu,
        values: MATRIX_BENCHMARK_SLUGS.map(
          (slug) => bestByGpuSlug.get(`${gpu.id}:${slug}`) ?? null,
        ),
      })),
    };
  }

  private async resolveReferenceCpu(cpuId?: string) {
    if (cpuId) {
      const cpu = await this.prisma.cpu.findUnique({
        where: { id: cpuId },
        select: {
          id: true,
          slug: true,
          name: true,
          gamingIndex: true,
        },
      });
      if (!cpu) {
        throw new NotFoundException(`CPU with id "${cpuId}" not found`);
      }
      if (cpu.gamingIndex == null) {
        throw new BadRequestException(
          `CPU "${cpu.name}" has no gamingIndex — run pnpm index:hardware`,
        );
      }
      return { ...cpu, gamingIndex: cpu.gamingIndex };
    }

    const cpu = await this.prisma.cpu.findFirst({
      where: {
        formFactor: FormFactor.DESKTOP,
        gamingIndex: { not: null },
      },
      orderBy: { gamingIndex: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        gamingIndex: true,
      },
    });

    if (!cpu || cpu.gamingIndex == null) {
      throw new BadRequestException(
        'No desktop CPU with gamingIndex found — run pnpm index:hardware',
      );
    }

    return { ...cpu, gamingIndex: cpu.gamingIndex };
  }
}
