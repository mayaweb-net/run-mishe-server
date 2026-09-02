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
  /\b((?:RTX|GTX|GT|GTS|RX|HD|R[79])\s+[A-Za-z0-9]+(?:\s+(?:Ti|SUPER|XT|XTX|GRE))*(?:\s+\d+\s*GB)?|\d{3,4}\s+GT)\b/i;

/** Steam often names a whole family; map to one catalogue SKU for matching. */
const GPU_SERIES_ALIASES: Record<string, string[]> = {
  'nvidia-geforce-gtx-660': [
    'GTX 600 series',
    'GeForce GTX 600 series',
    'NVIDIA GeForce GTX 600 series',
    'Nvidia 600 Series GPU',
  ],
  'amd-radeon-rx-460': ['RX 400 series', 'AMD RX 400 series'],
  'nvidia-geforce-gtx-970': ['GeForce 970', '970', 'NVIDIA 970'],
  'nvidia-geforce-rtx-2060': ['GeForce 2060', '2060'],
  'nvidia-geforce-gtx-1050': ['NVIDIA 1050', '1050'],
  'nvidia-geforce-gtx-760': ['GeForce 760'],
  'nvidia-geforce-gtx-750': ['GTS 750'],
  'nvidia-geforce-gtx-550-ti': ['GTX 550'],
  'amd-radeon-r9-270x': ['R7 270X'],
  'amd-radeon-r9-290': ['AMD Radeon 290', 'Radeon 290'],
  'nvidia-geforce-gtx-770': ['nVidia 770'],
  'nvidia-geforce-9800-gt': ['9800 GT', 'NVIDIA 9800 GT'],
  'nvidia-geforce-9600-gt': ['9600 GT', '9600GT'],
  'nvidia-geforce-8600-gt': ['8600', '9600GT'],
  'amd-radeon-hd-6870': ['HD 7000 series', 'AMD Radeon HD 7000 series'],
  'amd-radeon-hd-7970': ['AMD 7970', 'nVidia 770'],
  'amd-radeon-hd-5570': ['5570', 'AMD 5570'],
  'amd-radeon-hd-5450': ['5450', 'HD5450'],
  'nvidia-geforce-gts-450': ['450', 'nVidia 450'],
  'nvidia-geforce-6600': ['6600', 'NVidia 6600'],
  'amd-radeon-x1300': ['X1300', 'ATI X1300'],
};

function gpuAliasVariants(gpu: GpuSeed): string[] {
  const token = GPU_MODEL_TOKEN.exec(gpu.name)?.[1];
  if (!token) {
    const seriesAliases = GPU_SERIES_ALIASES[gpu.slug];
    return seriesAliases ? [...seriesAliases] : [];
  }

  // A laptop chip must never answer to the plain desktop model name.
  if (gpu.formFactor === 'LAPTOP') return [];

  // Steam often omits or disagrees on VRAM while still naming the same model.
  const modelOnlyToken = token.replace(/\s+\d+\s*GB$/i, '').trim();
  const variants = [...new Set([token, modelOnlyToken])];

  const gtxMatch = /^GTX\s+(\d{3,4}(?:\s*(?:Ti|SUPER))?)$/i.exec(modelOnlyToken);
  if (gtxMatch) {
    variants.push(`GeForce ${gtxMatch[1]}`, gtxMatch[1]);
  }

  const rtxMatch = /^RTX\s+(\d{3,4}(?:\s*(?:Ti|SUPER))?)$/i.exec(modelOnlyToken);
  if (rtxMatch) {
    variants.push(`GeForce ${rtxMatch[1]}`, rtxMatch[1]);
  }

  const legacyGtMatch = /^(\d{3,4})\s+GT$/i.exec(modelOnlyToken);
  if (legacyGtMatch) {
    variants.push(`${legacyGtMatch[1]} GT`, `GeForce ${legacyGtMatch[1]} GT`);
  }

  const gtMatch = /^(GT|GTS)\s+(\d{3,4})$/i.exec(modelOnlyToken);
  if (gtMatch) {
    variants.push(`${gtMatch[1]} ${gtMatch[2]}`);
  }

  const seriesAliases = GPU_SERIES_ALIASES[gpu.slug];
  if (seriesAliases) {
    variants.push(...seriesAliases);
  }

  return [...new Set(variants)];
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
