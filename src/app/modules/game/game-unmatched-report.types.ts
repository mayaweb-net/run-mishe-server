import {
  HardwareKind,
  RequirementTier,
} from '@/app/db/generated/prisma/client';

export interface UnmatchedRequirementGameRef {
  id: string;
  slug: string;
  name: string;
  tier: RequirementTier.MINIMUM | RequirementTier.RECOMMENDED;
}

export interface UnmatchedRequirementItem {
  kind: HardwareKind;
  rawText: string;
  gameCount: number;
  minimumCount: number;
  recommendedCount: number;
  isGeneric: boolean;
  games: UnmatchedRequirementGameRef[];
}

export interface UnmatchedRequirementsReportSummary {
  totalUnmatchedFields: number;
  uniqueCpuTexts: number;
  uniqueGpuTexts: number;
  actionableCpuTexts: number;
  actionableGpuTexts: number;
  affectedGames: number;
}

export interface UnmatchedRequirementsReport {
  generatedAt: string;
  summary: UnmatchedRequirementsReportSummary;
  items: UnmatchedRequirementItem[];
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function formatUnmatchedRequirementsCsv(
  report: UnmatchedRequirementsReport,
): string {
  const header = [
    'kind',
    'rawText',
    'gameCount',
    'minimumCount',
    'recommendedCount',
    'isGeneric',
    'sampleGames',
  ].join(',');

  const rows = report.items.map((item) =>
    [
      item.kind,
      csvEscape(item.rawText),
      item.gameCount,
      item.minimumCount,
      item.recommendedCount,
      item.isGeneric ? 'true' : 'false',
      csvEscape(
        item.games
          .slice(0, 5)
          .map((game) => game.name)
          .join('; '),
      ),
    ].join(','),
  );

  return `\uFEFF${header}\n${rows.join('\n')}\n`;
}
