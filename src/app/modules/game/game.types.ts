import { DataQuality, DemandTier, Prisma, RequirementTier } from '@/app/db/generated/prisma/client';

export type RequirementSummary = {
  cpu: string | null;
  gpu: string | null;
  ramGb: number | null;
  vramGb: number | null;
  os: string | null;
  storageGb: number | null;
};
export type GameListItem = {
  id: string;
  slug: string;
  name: string;
  nameFa: string | null;
  coverUrl: string | null;
  demandTier: DemandTier;
  isPopular: boolean;
  isPublished: boolean;
  releaseDate: Date | null;
  steamAppId: number | null;
  popularity: number | null;
  quality: DataQuality;
  minimum: RequirementSummary | null;
  recommended: RequirementSummary | null;
};

const requirementSelect = {
  tier: true,
  rawCpuText: true,
  rawGpuText: true,
  os: true,
  ramGb: true,
  vramGb: true,
  storageGb: true,
  options: {
    select: {
      kind: true,
      matchedText: true,
      cpu: { select: { id: true, name: true } },
      gpu: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.GameRequirementSelect;

export const gameListSelect = {
  id: true,
  slug: true,
  name: true,
  nameFa: true,
  coverUrl: true,
  demandTier: true,
  isPopular: true,
  isPublished: true,
  releaseDate: true,
  steamAppId: true,
  popularity: true,
  quality: true,
  requirements: {
    where: {
      tier: { in: [RequirementTier.MINIMUM, RequirementTier.RECOMMENDED] },
    },
    select: requirementSelect,
  },
} satisfies Prisma.GameSelect;

export const gameDetailSelect = {
  id: true,
  slug: true,
  name: true,
  nameFa: true,
  releaseDate: true,
  engine: true,
  developer: true,
  publisher: true,
  genres: true,
  coverUrl: true,
  description: true,
  steamAppId: true,
  igdbId: true,
  demandTier: true,
  isPopular: true,
  popularity: true,
  isPublished: true,
  quality: true,
  sourceName: true,
  sourceUrl: true,
  createdAt: true,
  updatedAt: true,
  requirements: {
    orderBy: { tier: 'asc' as const },
    select: {
      ...requirementSelect,
      directX: true,
      needsSsd: true,
      notes: true,
    },
  },
} satisfies Prisma.GameSelect;

type RequirementWithOptions = Prisma.GameRequirementGetPayload<{
  select: typeof requirementSelect;
}>;

export function mapRequirementSummary(
  requirement: RequirementWithOptions | undefined,
): RequirementSummary | null {
  if (!requirement) return null;

  const cpuOption = requirement.options.find((option) => option.kind === 'CPU');
  const gpuOption = requirement.options.find((option) => option.kind === 'GPU');

  return {
    cpu:
      cpuOption?.cpu?.name ??
      cpuOption?.matchedText ??
      requirement.rawCpuText ??
      null,
    gpu:
      gpuOption?.gpu?.name ??
      gpuOption?.matchedText ??
      requirement.rawGpuText ??
      null,
    ramGb: requirement.ramGb,
    vramGb: requirement.vramGb,
    os: requirement.os,
    storageGb: requirement.storageGb,
  };
}

export function mapGameListItem(
  game: Prisma.GameGetPayload<{ select: typeof gameListSelect }>,
): GameListItem {
  const minimum = game.requirements.find(
    (requirement) => requirement.tier === RequirementTier.MINIMUM,
  );
  const recommended = game.requirements.find(
    (requirement) => requirement.tier === RequirementTier.RECOMMENDED,
  );

  return {
    id: game.id,
    slug: game.slug,
    name: game.name,
    nameFa: game.nameFa,
    coverUrl: game.coverUrl,
    demandTier: game.demandTier,
    isPopular: game.isPopular,
    isPublished: game.isPublished,
    releaseDate: game.releaseDate,
    steamAppId: game.steamAppId,
    popularity: game.popularity,
    quality: game.quality,
    minimum: mapRequirementSummary(minimum),
    recommended: mapRequirementSummary(recommended),
  };
}
