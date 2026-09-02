import { DataQuality, DemandTier, Prisma, RequirementTier } from '@/app/db/generated/prisma/client';

export type RequirementSummary = {
  cpu: string | null;
  gpu: string | null;
  cpuLinked: boolean;
  gpuLinked: boolean;
  needsReview: boolean;
  optionCount: number;
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
  hasConnectionIssue: boolean;
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
      id: true,
      kind: true,
      matchedText: true,
      matchScore: true,
      needsReview: true,
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

  const cpuOptions = requirement.options.filter(
    (option) => option.kind === 'CPU',
  );
  const gpuOptions = requirement.options.filter(
    (option) => option.kind === 'GPU',
  );
  const cpuOption = pickPreferredOption(cpuOptions, 'CPU');
  const gpuOption = pickPreferredOption(gpuOptions, 'GPU');

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
    cpuLinked: cpuOptions.some((option) => option.cpu != null),
    gpuLinked: gpuOptions.some((option) => option.gpu != null),
    needsReview: requirement.options.some((option) => option.needsReview),
    optionCount: requirement.options.filter(
      (option) => option.cpu != null || option.gpu != null,
    ).length,
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

  const minimumSummary = mapRequirementSummary(minimum);
  const recommendedSummary = mapRequirementSummary(recommended);

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
    hasConnectionIssue: [minimumSummary, recommendedSummary].some(
      (summary) =>
        summary?.needsReview ||
        (summary?.cpu != null && !summary.cpuLinked) ||
        (summary?.gpu != null && !summary.gpuLinked),
    ),
    minimum: minimumSummary,
    recommended: recommendedSummary,
  };
}

type RequirementOption = RequirementWithOptions['options'][number];

function pickPreferredOption(
  options: RequirementOption[],
  kind: 'CPU' | 'GPU',
): RequirementOption | undefined {
  const isResolved = (option: RequirementOption) =>
    kind === 'CPU' ? option.cpu != null : option.gpu != null;

  return (
    options.find(
      (option) =>
        option.matchedText.startsWith('admin:') && isResolved(option),
    ) ??
    [...options]
      .filter(isResolved)
      .sort((left, right) => right.matchScore - left.matchScore)[0]
  );
}
