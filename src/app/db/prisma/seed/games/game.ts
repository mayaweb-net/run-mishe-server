import {
  DataQuality,
  Prisma,
  PrismaClient,
  RequirementTier,
} from '../../../generated/prisma/client';

import { slugify } from '../hardware/shared';
import { GAME_SEED } from './game-data';
import {
  matchRequirementHardware,
  type MatchKind,
  type RequirementAlias,
} from './requirement-matcher';

const SOURCE_NAME = 'Steam Store';

interface MatchCoverage {
  fieldsWithText: number;
  matchedFields: number;
  options: number;
}

function gameSlugs(): Map<number, string> {
  const claimed = new Set<string>();
  const slugs = new Map<number, string>();

  for (const game of GAME_SEED) {
    const base = slugify(game.name) || `steam-${game.steamAppId}`;
    const slug = claimed.has(base) ? `${base}-${game.steamAppId}` : base;
    claimed.add(slug);
    slugs.set(game.steamAppId, slug);
  }

  return slugs;
}

async function syncRequirementOptions(
  prisma: PrismaClient,
  requirementId: string,
  rawCpuText: string | null,
  rawGpuText: string | null,
  aliases: readonly RequirementAlias[],
  coverage: Record<MatchKind, MatchCoverage>,
): Promise<void> {
  const fields: ReadonlyArray<[MatchKind, string | null]> = [
    ['CPU', rawCpuText],
    ['GPU', rawGpuText],
  ];

  for (const [kind, text] of fields) {
    const matches = matchRequirementHardware(text, kind, aliases);
    const hasAdminOverride =
      (await prisma.gameRequirementOption.count({
        where: {
          requirementId,
          kind,
          matchedText: { startsWith: 'admin:' },
        },
      })) > 0;
    const unresolvedMatchedText =
      text && matches.length === 0 && !hasAdminOverride
        ? `unresolved:${kind}:${text}`
        : null;
    const expectedMatchedTexts = [
      ...matches.map((match) => match.matchedText),
      ...(unresolvedMatchedText ? [unresolvedMatchedText] : []),
    ];

    if (text) coverage[kind].fieldsWithText += 1;
    if (matches.length > 0) coverage[kind].matchedFields += 1;
    coverage[kind].options += matches.length;

    await prisma.gameRequirementOption.deleteMany({
      where: {
        requirementId,
        kind,
        matchedText: { notIn: expectedMatchedTexts },
        NOT: [
          { matchedText: { startsWith: 'admin:' } },
          { matchedText: { startsWith: 'legacy:' } },
        ],
      },
    });

    for (const match of matches) {
      await prisma.gameRequirementOption.upsert({
        where: {
          requirementId_kind_matchedText: {
            requirementId,
            kind,
            matchedText: match.matchedText,
          },
        },
        create: {
          requirementId,
          kind,
          matchedText: match.matchedText,
          cpuId: match.cpuId,
          gpuId: match.gpuId,
          matchScore: match.matchScore,
          needsReview: match.needsReview,
        },
        update: {
          cpuId: match.cpuId,
          gpuId: match.gpuId,
          matchScore: match.matchScore,
          needsReview: match.needsReview,
        },
      });
    }

    if (unresolvedMatchedText) {
      await prisma.gameRequirementOption.upsert({
        where: {
          requirementId_kind_matchedText: {
            requirementId,
            kind,
            matchedText: unresolvedMatchedText,
          },
        },
        create: {
          requirementId,
          kind,
          matchedText: unresolvedMatchedText,
          matchScore: 0,
          needsReview: true,
        },
        update: {
          cpuId: null,
          gpuId: null,
          matchScore: 0,
          needsReview: true,
        },
      });
    }
  }
}

export async function seedGames(prisma: PrismaClient): Promise<void> {
  const slugs = gameSlugs();
  const aliases: RequirementAlias[] = (
    await prisma.hardwareAlias.findMany({
      select: {
        kind: true,
        alias: true,
        cpuId: true,
        gpuId: true,
        weight: true,
      },
    })
  ).map((alias) => ({ ...alias, kind: alias.kind as MatchKind }));
  const coverage: Record<MatchKind, MatchCoverage> = {
    CPU: { fieldsWithText: 0, matchedFields: 0, options: 0 },
    GPU: { fieldsWithText: 0, matchedFields: 0, options: 0 },
  };
  let requirementCount = 0;

  for (const game of GAME_SEED) {
    const requirementSourceUrl = `https://store.steampowered.com/app/${game.steamAppId}`;
    const data = {
      slug: slugs.get(game.steamAppId)!,
      name: game.name,
      releaseDate: game.releaseDate
        ? new Date(`${game.releaseDate}T00:00:00.000Z`)
        : null,
      developer: game.developer,
      publisher: game.publisher,
      genres: [...game.genres],
      coverUrl: game.coverUrl,
      description: game.description,
      steamAppId: game.steamAppId,
      isPopular: true,
      popularity: game.popularity,
      isPublished: true,
      quality: DataQuality.IMPORTED,
      sourceName: game.sourceName,
      sourceUrl: game.sourceUrl,
      rawPayload: game.steamSnapshot as Prisma.InputJsonValue,
    };

    const existing = await prisma.game.findUnique({
      where: { steamAppId: game.steamAppId },
      select: { quality: true },
    });
    const isVerified = existing?.quality === DataQuality.VERIFIED;

    const persisted = await prisma.game.upsert({
      where: { steamAppId: game.steamAppId },
      create: data,
      update: isVerified ? {} : data,
    });

    if (isVerified) {
      continue;
    }

    const tiers = game.requirements.map(
      (requirement) => RequirementTier[requirement.tier],
    );
    await prisma.gameRequirement.deleteMany({
      where: {
        gameId: persisted.id,
        tier: { notIn: tiers },
        sourceName: SOURCE_NAME,
      },
    });

    for (const requirement of game.requirements) {
      const requirementData = {
        rawCpuText: requirement.rawCpuText,
        rawGpuText: requirement.rawGpuText,
        os: requirement.os,
        ramGb: requirement.ramGb,
        vramGb: requirement.vramGb,
        storageGb: requirement.storageGb,
        directX: requirement.directX,
        needsSsd: requirement.needsSsd,
        notes: requirement.notes,
        sourceName: SOURCE_NAME,
        sourceUrl: requirementSourceUrl,
      };

      const persistedRequirement = await prisma.gameRequirement.upsert({
        where: {
          gameId_tier: {
            gameId: persisted.id,
            tier: RequirementTier[requirement.tier],
          },
        },
        create: {
          gameId: persisted.id,
          tier: RequirementTier[requirement.tier],
          ...requirementData,
        },
        update: requirementData,
      });
      await syncRequirementOptions(
        prisma,
        persistedRequirement.id,
        requirement.rawCpuText,
        requirement.rawGpuText,
        aliases,
        coverage,
      );
      requirementCount += 1;
    }
  }

  console.log(
    `Game seed complete: ${GAME_SEED.length} games, ` +
      `${requirementCount} requirement tiers, ` +
      `${coverage.CPU.options} CPU and ${coverage.GPU.options} GPU options.`,
  );
  console.log(
    `Requirement coverage: CPU ${coverage.CPU.matchedFields}/` +
      `${coverage.CPU.fieldsWithText}, GPU ${coverage.GPU.matchedFields}/` +
      `${coverage.GPU.fieldsWithText} fields matched exactly.`,
  );
}
