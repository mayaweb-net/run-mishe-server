import {
  DataQuality,
  FormFactor,
  HardwareKind,
  Prisma,
  PrismaClient,
} from '../../../generated/prisma/client';

import { GPU_SEED } from './gpu-data';
import {
  assertUnique,
  buildAliases,
  normalizeHardwareName,
  toVendor,
} from './shared';
import type { GpuSeed } from './types';

const GPU_ARK_DATASET_URL = 'https://gpuark.com/datasets/';
const GPU_ARK_SNAPSHOT = new Date('2026-05-25T00:00:00.000Z');
const SOURCE_NAME = 'GPU Ark + TechPowerUp + BuildCores';

interface PreparedGpu {
  data: Prisma.GpuCreateInput;
  aliases: string[];
  gpiScore: number;
}

/**
 * "NVIDIA GeForce RTX 4070 SUPER" -> "RTX 4070 SUPER".
 *
 * Nobody types the brand line, so the model token has to resolve on its own.
 * The bare number ("4070") is deliberately not produced: it is ambiguous
 * across vendors and generations.
 */
const GPU_MODEL_TOKEN =
  /\b((?:RTX|GTX|RX|Arc)\s+[A-Za-z0-9]+(?:\s+(?:Ti|SUPER|XT|XTX|GRE))*(?:\s+\d+\s*GB)?)/i;

function gpuAliasVariants(gpu: GpuSeed): string[] {
  const token = GPU_MODEL_TOKEN.exec(gpu.name)?.[1];
  if (!token) return [];

  // A laptop chip must never answer to the plain desktop model name.
  if (gpu.formFactor === 'LAPTOP') return [];

  // Steam often omits or disagrees on VRAM while still naming the same model.
  // Keep the exact token and a model-only alias; the claimed-alias rule below
  // picks one canonical SKU if multiple VRAM variants exist.
  const modelOnlyToken = token.replace(/\s+\d+\s*GB$/i, '').trim();
  return [...new Set([token, modelOnlyToken])];
}

function toCreateInput(gpu: GpuSeed): Prisma.GpuCreateInput {
  const vendor = toVendor(gpu.vendor);

  return {
    slug: gpu.slug,
    normalizedName: normalizeHardwareName(gpu.name),
    name: gpu.name,
    vendor,
    family: gpu.family,
    series: gpu.series,
    architecture: gpu.architecture,
    codename: gpu.codename,
    chip: gpu.codename,
    releaseDate: gpu.releaseDate
      ? new Date(`${gpu.releaseDate}T00:00:00.000Z`)
      : null,
    shadingUnits: gpu.shadingUnits,
    tmus: gpu.tmus,
    rops: gpu.rops,
    tensorCores: gpu.tensorCores,
    rayTracingCores: gpu.rayTracingCores,
    baseClockMhz: gpu.baseClockMhz,
    boostClockMhz: gpu.boostClockMhz,
    memoryClockMhz: gpu.memoryClockMhz,
    vramGb: gpu.vramGb,
    memoryType: gpu.memoryType,
    memoryBusBits: gpu.memoryBusBits,
    bandwidthGbps: gpu.bandwidthGbps,
    busInterface: gpu.busInterface,
    pcieVersion: gpu.pcieVersion,
    pcieLanes: gpu.pcieLanes,
    tdpWatt: gpu.tdpWatt,
    recommendedPsuW: gpu.recommendedPsuW,
    formFactor: FormFactor[gpu.formFactor],
    isWorkstation: false,
    supportsRayTracing: gpu.supportsRayTracing,
    supportsCuda: gpu.vendor === 'NVIDIA',
    gamingIndex: gpu.gamingIndex,
    indexCalculatedAt: GPU_ARK_SNAPSHOT,
    quality: DataQuality.IMPORTED,
    sourceName: SOURCE_NAME,
    sourceUrl: gpu.sourceUrl,
    rawPayload: gpu as unknown as Prisma.InputJsonValue,
  };
}

export function prepareGpus(): PreparedGpu[] {
  assertUnique(
    GPU_SEED.map((gpu) => gpu.slug),
    'GPU slug',
  );
  assertUnique(
    GPU_SEED.map((gpu) => normalizeHardwareName(gpu.name)),
    'GPU normalized name',
  );

  const claimed = new Map<string, string>();

  return GPU_SEED.map((gpu) => {
    // An alias must resolve to exactly one GPU, so the first card to claim a
    // spelling keeps it and later cards fall back to their full name.
    const aliases = buildAliases(gpu.name, gpuAliasVariants(gpu)).filter((alias) => {
      const owner = claimed.get(alias);
      if (owner && owner !== gpu.slug) return false;
      claimed.set(alias, gpu.slug);
      return true;
    });

    return { data: toCreateInput(gpu), aliases, gpiScore: gpu.gpiScore };
  });
}

export async function seedGpus(prisma: PrismaClient): Promise<void> {
  const prepared = prepareGpus();

  const benchmark = await prisma.benchmark.upsert({
    where: { slug: 'gpuark-gpi' },
    create: {
      slug: 'gpuark-gpi',
      name: 'GPU Ark GPI',
      vendor: 'GPU Ark',
      target: HardwareKind.GPU,
      category: 'gpu-gaming',
      unit: 'index',
      higherIsBetter: true,
      weightInIndex: 1,
      sourceUrl: GPU_ARK_DATASET_URL,
      description: 'Relative GPU performance index supplied by GPU Ark.',
    },
    update: { isActive: true, sourceUrl: GPU_ARK_DATASET_URL },
  });

  let aliasCount = 0;

  for (const { data, aliases, gpiScore } of prepared) {
    const gpu = await prisma.gpu.upsert({
      where: { slug: data.slug },
      create: data,
      update: data,
    });

    for (const alias of aliases) {
      await prisma.hardwareAlias.upsert({
        where: { kind_alias: { kind: HardwareKind.GPU, alias } },
        create: { kind: HardwareKind.GPU, alias, gpuId: gpu.id },
        update: { gpuId: gpu.id, cpuId: null },
      });
      aliasCount += 1;
    }

    await prisma.gpuBenchmarkScore.upsert({
      where: {
        gpuId_benchmarkId_source: {
          gpuId: gpu.id,
          benchmarkId: benchmark.id,
          source: 'gpuark',
        },
      },
      create: {
        gpuId: gpu.id,
        benchmarkId: benchmark.id,
        score: gpiScore,
        source: 'gpuark',
        sourceUrl: GPU_ARK_DATASET_URL,
        capturedAt: GPU_ARK_SNAPSHOT,
      },
      update: {
        score: gpiScore,
        sourceUrl: GPU_ARK_DATASET_URL,
        capturedAt: GPU_ARK_SNAPSHOT,
      },
    });
  }

  console.log(
    `GPU seed complete: ${prepared.length} GPUs, ${aliasCount} aliases, ` +
      `${prepared.length} GPI scores.`,
  );
}
