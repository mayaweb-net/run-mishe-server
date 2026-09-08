import type { DemandTier, PrismaClient } from '@/app/db/generated/prisma/client';
import { applyDemandTierOverride } from './demand-tier-overrides';
import {
  maxGamingIndex,
  resolveDemandTierFromGpuIndexes,
} from './demand-tier';

export interface DemandTierJobUpdate {
  gameId: string;
  slug: string;
  name: string;
  previousTier: DemandTier;
  nextTier: DemandTier;
  autoTier: DemandTier;
  overridden: boolean;
  maxRecommendedGpuIndex: number;
  changed: boolean;
}

export interface DemandTierJobSummary {
  totalGames: number;
  updated: number;
  unchanged: number;
  skippedNoRecommendedGpu: number;
  overridden: number;
  byTier: Record<DemandTier, number>;
  updates: DemandTierJobUpdate[];
}

export async function runDemandTierJob(
  prisma: PrismaClient,
  options: { dryRun?: boolean } = {},
): Promise<DemandTierJobSummary> {
  const games = await prisma.game.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      demandTier: true,
      requirements: {
        where: { tier: 'RECOMMENDED' },
        select: {
          options: {
            where: { kind: 'GPU', gpuId: { not: null } },
            select: {
              gpu: { select: { gamingIndex: true } },
            },
          },
        },
      },
    },
    orderBy: { slug: 'asc' },
  });

  const byTier: Record<DemandTier, number> = {
    LIGHT: 0,
    MEDIUM: 0,
    HEAVY: 0,
    EXTREME: 0,
  };

  const updates: DemandTierJobUpdate[] = [];
  let updated = 0;
  let unchanged = 0;
  let skippedNoRecommendedGpu = 0;
  let overridden = 0;

  for (const game of games) {
    const indexes = game.requirements.flatMap((requirement) =>
      requirement.options.map((option) => option.gpu?.gamingIndex ?? null),
    );
    const maxRecommendedGpuIndex = maxGamingIndex(indexes);
    const autoTier =
      maxRecommendedGpuIndex == null
        ? null
        : resolveDemandTierFromGpuIndexes([maxRecommendedGpuIndex]);

    if (autoTier == null || maxRecommendedGpuIndex == null) {
      skippedNoRecommendedGpu += 1;
      byTier[game.demandTier] += 1;
      continue;
    }

    const resolved = applyDemandTierOverride(game.slug, autoTier);
    const nextTier = resolved.tier;
    if (resolved.overridden) overridden += 1;

    const changed = game.demandTier !== nextTier;
    updates.push({
      gameId: game.id,
      slug: game.slug,
      name: game.name,
      previousTier: game.demandTier,
      nextTier,
      autoTier,
      overridden: resolved.overridden,
      maxRecommendedGpuIndex,
      changed,
    });
    byTier[nextTier] += 1;

    if (!changed) {
      unchanged += 1;
      continue;
    }

    if (!options.dryRun) {
      await prisma.game.update({
        where: { id: game.id },
        data: { demandTier: nextTier },
      });
    }
    updated += 1;
  }

  return {
    totalGames: games.length,
    updated,
    unchanged,
    skippedNoRecommendedGpu,
    overridden,
    byTier,
    updates,
  };
}
