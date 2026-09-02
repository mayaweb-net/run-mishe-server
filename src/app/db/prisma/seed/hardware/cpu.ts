import {
  DataQuality,
  FormFactor,
  HardwareKind,
  Prisma,
  PrismaClient,
} from '../../../generated/prisma/client';

import { CPU_SEED } from './cpu-data';
import {
  assertUnique,
  buildAliases,
  normalizeHardwareName,
  toVendor,
} from './shared';
import type { CpuSeed } from './types';

const BUILDCORES_URL = 'https://github.com/buildcores/buildcores-open-db';
const SOURCE_NAME = 'BuildCores Open DB';

/** Steam often names a whole family; map to one catalogue SKU for matching. */
const CPU_SERIES_ALIASES: Record<string, string[]> = {
  'intel-core-i5-8400': [
    'Intel Core i5',
    'Core i5',
    'Intel i5',
    'Intel I5',
  ],
  'intel-core-i3-8100': ['Intel Core i3', 'Core i3', 'Intel i3'],
  'intel-core-i7-8700': ['Intel Core i7', 'Core i7', 'Intel i7', 'Intel Core i7+'],
  'amd-ryzen-5-5600': [
    'Ryzen 5',
    'Ryzen 5 CPU or Equivalent',
    'Intel i5/Ryzen 5 series',
    'Intel Core i7 or AMD Ryzen 5',
  ],
  'intel-core-2-duo-e8400': ['Core 2 Duo', 'Intel Core 2 Duo'],
  'amd-phenom-x3-8650': ['AMD Phenom X3 8650'],
};

interface PreparedCpu {
  data: Prisma.CpuCreateInput;
  aliases: string[];
}

/**
 * Extra spellings for a CPU.
 *
 * Users and Steam requirement strings drop the brand words constantly, so
 * "i5-13600K" and "Ryzen 5 5600X" have to resolve as well as the full name.
 */
function cpuAliasVariants(cpu: CpuSeed): string[] {
  const variants: string[] = [];
  const short = cpu.name
    .replace(/^Intel Core\s+/i, '')
    .replace(/^AMD\s+/i, '')
    .trim();

  if (short && short !== cpu.name) variants.push(short);
  variants.push(cpu.name.replace(/\bCore\s+/i, ''));

  const fxMatch = cpu.name.match(/\bFX-(\d{4})\b/i);
  if (fxMatch) {
    variants.push(`FX-${fxMatch[1]}`, `FX ${fxMatch[1]}`);
  }

  const aSeriesMatch = cpu.name.match(/\bA(\d+)-(\d{4}\w*)\b/i);
  if (aSeriesMatch) {
    variants.push(`A${aSeriesMatch[1]}-${aSeriesMatch[2]}`);
  }

  const phenomMatch = cpu.name.match(/Phenom II X(\d)\s+(\d+)/i);
  if (phenomMatch) {
    variants.push(
      `Phenom II X${phenomMatch[1]} ${phenomMatch[2]}`,
      `Phenom X${phenomMatch[1]} ${phenomMatch[2]}`,
    );
  }

  const pentiumMatch = cpu.name.match(/Pentium G(\d{4})/i);
  if (pentiumMatch) {
    variants.push(`Pentium G${pentiumMatch[1]}`);
  }

  const seriesAliases = CPU_SERIES_ALIASES[cpu.slug];
  if (seriesAliases) {
    variants.push(...seriesAliases);
  }

  return variants;
}

function toCreateInput(cpu: CpuSeed): Prisma.CpuCreateInput {
  return {
    slug: cpu.slug,
    normalizedName: normalizeHardwareName(cpu.name),
    name: cpu.name,
    vendor: toVendor(cpu.vendor),
    family: cpu.family,
    series: cpu.series,
    generation: cpu.generation,
    codename: cpu.codename,
    architecture: cpu.architecture,
    socket: cpu.socket,
    releaseDate: cpu.releaseYear
      ? new Date(Date.UTC(cpu.releaseYear, 0, 1))
      : null,
    performanceCores: cpu.performanceCores,
    efficiencyCores: cpu.efficiencyCores,
    threads: cpu.threads,
    baseClockMhz: cpu.baseClockMhz,
    boostClockMhz: cpu.boostClockMhz,
    l2CacheMb: cpu.l2CacheMb,
    l3CacheMb: cpu.l3CacheMb,
    tdpWatt: cpu.tdpWatt,
    processNodeNm: cpu.processNodeNm,
    formFactor: FormFactor.DESKTOP,
    isUnlocked: cpu.isUnlocked,
    isX3d: cpu.isX3d,
    memoryTypes: cpu.memoryTypes,
    memoryChannels: cpu.memoryChannels,
    maxMemoryGb: cpu.maxMemoryGb,
    // Left unset on purpose: the source has no benchmark data, and the index
    // job is the only thing allowed to write it. See document/data-sources.md.
    gamingIndex: null,
    quality: DataQuality.IMPORTED,
    sourceName: SOURCE_NAME,
    sourceUrl: cpu.sourceUrl ?? BUILDCORES_URL,
    rawPayload: cpu as unknown as Prisma.InputJsonValue,
  };
}

export function prepareCpus(): PreparedCpu[] {
  assertUnique(
    CPU_SEED.map((cpu) => cpu.slug),
    'CPU slug',
  );
  assertUnique(
    CPU_SEED.map((cpu) => normalizeHardwareName(cpu.name)),
    'CPU normalized name',
  );

  const claimed = new Map<string, string>();

  return CPU_SEED.map((cpu) => {
    const aliases = buildAliases(cpu.name, cpuAliasVariants(cpu)).filter(
      (alias) => {
        const owner = claimed.get(alias);
        if (owner && owner !== cpu.slug) return false;
        claimed.set(alias, cpu.slug);
        return true;
      },
    );

    return { data: toCreateInput(cpu), aliases };
  });
}

export async function seedCpus(prisma: PrismaClient): Promise<void> {
  const prepared = prepareCpus();
  let aliasCount = 0;

  for (const { data, aliases } of prepared) {
    const cpu = await prisma.cpu.upsert({
      where: { slug: data.slug },
      create: data,
      update: data,
    });

    for (const alias of aliases) {
      await prisma.hardwareAlias.upsert({
        where: { kind_alias: { kind: HardwareKind.CPU, alias } },
        create: { kind: HardwareKind.CPU, alias, cpuId: cpu.id },
        update: { cpuId: cpu.id, gpuId: null },
      });
      aliasCount += 1;
    }
  }

  console.log(
    `CPU seed complete: ${prepared.length} CPUs, ${aliasCount} aliases. ` +
      'gamingIndex is unset until a CPU benchmark source is imported.',
  );
}
