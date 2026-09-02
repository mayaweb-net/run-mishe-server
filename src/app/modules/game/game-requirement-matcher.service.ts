import { Injectable } from '@nestjs/common';
import { HardwareKind, RequirementTier } from '@/app/db/generated/prisma/client';
import { normalizeHardwareName } from '@/app/common/hardware/normalize-hardware-name';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import {
  matchRequirementHardware,
  type MatchKind,
  type RequirementAlias,
} from '@/app/db/prisma/seed/games/requirement-matcher';
import { isGenericRequirementText } from './requirement-text.utils';

export type RequirementMatchSource = 'exact' | 'search';

export interface HardwareMatchSuggestion {
  hardwareId: string;
  hardwareName: string;
  matchedText: string;
  matchScore: number;
  source: RequirementMatchSource;
  alias: string | null;
}

export interface RequirementFieldSuggestions {
  tier: RequirementTier.MINIMUM | RequirementTier.RECOMMENDED;
  kind: MatchKind;
  rawText: string | null;
  currentHardwareId: string | null;
  currentHardwareName: string | null;
  isLinked: boolean;
  suggestions: HardwareMatchSuggestion[];
}

const MODEL_PATTERNS = [
  /(?:intel\s+)?core\s+i[3579][-\s]?\d+\w*/gi,
  /ryzen\s*\d+\s*\d+\w*/gi,
  /(?:geforce\s+)?(?:gtx|rtx|gt|gts)\s*\d+\w*/gi,
  /(?:radeon\s+)?(?:rx|hd|r[79])\s*\d+\w*/gi,
  /fx[-\s]?\d{4}/gi,
  /(?:geforce\s+)?gtx\s*\d+\w*/gi,
  /(?:geforce\s+)?rtx\s*\d+\w*/gi,
  /(?:radeon\s+)?rx\s*\d+\w*/gi,
  /(?:radeon\s+)?hd\s*\d+\w*/gi,
  /fx[-\s]?\d+\w*/gi,
] as const;

function extractSearchQueries(text: string): string[] {
  const queries = new Set<string>();

  for (const segment of text.split(/\s+\/\s+|\s+or\s+|,/i)) {
    const trimmed = segment.trim();
    if (trimmed.length >= 3) queries.add(trimmed);
  }

  for (const pattern of MODEL_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      if (value.length >= 3) queries.add(value);
    }
  }

  if (text.trim().length >= 3) {
    queries.add(text.trim());
  }

  return [...queries].slice(0, 8);
}

@Injectable()
export class GameRequirementMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  async suggestForGame(gameId: string): Promise<RequirementFieldSuggestions[]> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: {
        requirements: {
          where: {
            tier: {
              in: [RequirementTier.MINIMUM, RequirementTier.RECOMMENDED],
            },
          },
          select: {
            tier: true,
            rawCpuText: true,
            rawGpuText: true,
            options: {
              select: {
                kind: true,
                matchedText: true,
                matchScore: true,
                needsReview: true,
                cpu: { select: { id: true, name: true } },
                gpu: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!game) return [];

    const aliases = await this.loadAliases();
    const results: RequirementFieldSuggestions[] = [];

    for (const requirement of game.requirements) {
      if (
        requirement.tier !== RequirementTier.MINIMUM &&
        requirement.tier !== RequirementTier.RECOMMENDED
      ) {
        continue;
      }

      for (const kind of ['CPU', 'GPU'] as const) {
        const rawText =
          kind === 'CPU' ? requirement.rawCpuText : requirement.rawGpuText;
        const options = requirement.options.filter(
          (option) => option.kind === kind,
        );
        const current = this.pickCurrentOption(options, kind);

        results.push({
          tier: requirement.tier,
          kind,
          rawText,
          currentHardwareId: current?.hardwareId ?? null,
          currentHardwareName: current?.hardwareName ?? null,
          isLinked: current?.isLinked ?? false,
          suggestions: await this.buildSuggestions(rawText, kind, aliases),
        });
      }
    }

    return results.sort(
      (left, right) =>
        left.tier.localeCompare(right.tier) ||
        left.kind.localeCompare(right.kind),
    );
  }

  private async buildSuggestions(
    rawText: string | null,
    kind: MatchKind,
    aliases: RequirementAlias[],
  ): Promise<HardwareMatchSuggestion[]> {
    if (!rawText?.trim() || isGenericRequirementText(rawText)) {
      return [];
    }

    const suggestions = new Map<string, HardwareMatchSuggestion>();

    for (const match of matchRequirementHardware(rawText, kind, aliases)) {
      const hardwareId = kind === 'CPU' ? match.cpuId : match.gpuId;
      if (!hardwareId) continue;

      const hardware = await this.findHardware(kind, hardwareId);
      if (!hardware) continue;

      suggestions.set(hardwareId, {
        hardwareId,
        hardwareName: hardware.name,
        matchedText: match.matchedText,
        matchScore: match.matchScore,
        source: 'exact',
        alias: match.alias,
      });
    }

    for (const query of extractSearchQueries(rawText)) {
      const rows = await this.searchHardware(kind, query, 5);
      for (const row of rows) {
        if (suggestions.has(row.id)) continue;

        suggestions.set(row.id, {
          hardwareId: row.id,
          hardwareName: row.name,
          matchedText: query,
          matchScore: 0.75,
          source: 'search',
          alias: null,
        });
      }
    }

    return [...suggestions.values()].sort(
      (left, right) =>
        right.matchScore - left.matchScore ||
        left.hardwareName.localeCompare(right.hardwareName),
    );
  }

  private pickCurrentOption(
    options: Array<{
      matchedText: string;
      matchScore: number;
      needsReview: boolean;
      cpu: { id: string; name: string } | null;
      gpu: { id: string; name: string } | null;
    }>,
    kind: MatchKind,
  ) {
    const resolved = (option: (typeof options)[number]) =>
      kind === 'CPU' ? option.cpu : option.gpu;

    const preferred =
      options.find(
        (option) =>
          option.matchedText.startsWith('admin:') && resolved(option),
      ) ??
      [...options]
        .filter((option) => resolved(option))
        .sort((left, right) => right.matchScore - left.matchScore)[0];

    if (!preferred) {
      return {
        hardwareId: null,
        hardwareName: null,
        isLinked: false,
      };
    }

    const hardware = resolved(preferred);
    return {
      hardwareId: hardware?.id ?? null,
      hardwareName: hardware?.name ?? null,
      isLinked: hardware != null,
    };
  }

  private async loadAliases(): Promise<RequirementAlias[]> {
    const rows = await this.prisma.hardwareAlias.findMany({
      select: {
        kind: true,
        alias: true,
        cpuId: true,
        gpuId: true,
        weight: true,
      },
    });

    return rows.map((row) => ({
      kind: row.kind as MatchKind,
      alias: row.alias,
      cpuId: row.cpuId,
      gpuId: row.gpuId,
      weight: row.weight,
    }));
  }

  private async findHardware(kind: MatchKind, hardwareId: string) {
    if (kind === 'CPU') {
      return this.prisma.cpu.findUnique({
        where: { id: hardwareId },
        select: { id: true, name: true },
      });
    }

    return this.prisma.gpu.findUnique({
      where: { id: hardwareId },
      select: { id: true, name: true },
    });
  }

  private async searchHardware(kind: MatchKind, query: string, limit: number) {
    const normalized = normalizeHardwareName(query);

    if (kind === 'CPU') {
      return this.prisma.cpu.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { normalizedName: { contains: normalized, mode: 'insensitive' } },
            {
              aliases: {
                some: {
                  alias: { contains: query.toLowerCase(), mode: 'insensitive' },
                },
              },
            },
          ],
        },
        take: limit,
        orderBy: [{ gamingIndex: 'desc' }, { name: 'asc' }],
        select: { id: true, name: true },
      });
    }

    return this.prisma.gpu.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { normalizedName: { contains: normalized, mode: 'insensitive' } },
          {
            aliases: {
              some: {
                alias: { contains: query.toLowerCase(), mode: 'insensitive' },
              },
            },
          },
        ],
      },
      take: limit,
      orderBy: [{ gamingIndex: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
  }
}
