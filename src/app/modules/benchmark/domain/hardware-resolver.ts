import { normalizeHardwareName } from '@/app/common/hardware/normalize-hardware-name';
import type {
  CatalogHardware,
  HardwareResolution,
  HardwareTarget,
} from './types';

export function safeShortName(value: string, target: HardwareTarget): string {
  const normalized = normalizeHardwareName(value);
  if (target === 'CPU') {
    return normalized
      .replace(/^(?:amd|intel)\s+/, '')
      .replace(/\bphenom\s+x3\s+(\d+)\b/, 'phenom $1')
      .replace(/^fx\s+fx\s+/, 'fx ')
      .replace(/^a\s+a(\d+)\s+/, 'a$1 ')
      .replace(/^a\s+(\d+)\s+/, 'a$1 ');
  }
  return normalized
    .replace(/^(?:(?:amd|intel|nvidia)\s+)?(?:geforce|radeon)\s+/, '')
    .replace(/\bwith\s+max\s+q\s+design\b/g, 'max q')
    .replace(/\blaptop\s+gpu\b/g, 'laptop')
    .replace(/\bmobile\b/g, 'laptop')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip trailing VRAM tokens for residual PassMark default-SKU matching. */
export function stripVramToken(value: string): string {
  return value
    .replace(/\s+\d+gb\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addToIndex(
  index: Map<string, CatalogHardware[]>,
  key: string,
  hardware: CatalogHardware,
): void {
  if (!key) return;
  const rows = index.get(key) ?? [];
  if (!rows.some((row) => row.slug === hardware.slug)) rows.push(hardware);
  index.set(key, rows);
}

function comparePreferred(a: CatalogHardware, b: CatalogHardware): number {
  const aRank = a.preferenceRank ?? Number.POSITIVE_INFINITY;
  const bRank = b.preferenceRank ?? Number.POSITIVE_INFINITY;
  if (aRank !== bRank) return aRank - bRank;
  const aIndex = a.gamingIndex ?? Number.NEGATIVE_INFINITY;
  const bIndex = b.gamingIndex ?? Number.NEGATIVE_INFINITY;
  if (aIndex !== bIndex) return bIndex - aIndex;
  return a.slug.localeCompare(b.slug);
}

export class HardwareResolver {
  private readonly normalized = new Map<string, CatalogHardware[]>();
  private readonly aliases = new Map<string, CatalogHardware[]>();
  private readonly safe = new Map<string, CatalogHardware[]>();
  private readonly byBase = new Map<string, CatalogHardware[]>();

  constructor(
    hardware: readonly CatalogHardware[],
    private readonly target: HardwareTarget,
  ) {
    for (const row of hardware.filter((item) => item.target === target)) {
      addToIndex(this.normalized, row.normalizedName, row);
      for (const alias of row.aliases ?? []) {
        addToIndex(this.aliases, normalizeHardwareName(alias), row);
      }
      addToIndex(this.safe, safeShortName(row.name, target), row);
      addToIndex(
        this.byBase,
        stripVramToken(safeShortName(row.name, target)),
        row,
      );
    }
  }

  resolve(sourceName: string): HardwareResolution {
    const normalized = normalizeHardwareName(sourceName);
    const exact = this.normalized.get(normalized) ?? [];
    if (exact.length === 1) {
      return {
        hardware: exact[0],
        status: 'resolved',
        method: 'normalized-name',
      };
    }

    const alias = this.aliases.get(normalized) ?? [];
    if (alias.length === 1) {
      return { hardware: alias[0], status: 'resolved', method: 'alias' };
    }

    const short = safeShortName(sourceName, this.target);
    const safe = this.safe.get(short) ?? [];
    if (safe.length === 1) {
      return {
        hardware: safe[0],
        status: 'resolved',
        method: 'safe-normalization',
      };
    }

    // Bare model without VRAM (or unmatched VRAM spelling) → default SKU.
    const base = stripVramToken(short);
    const siblings = this.byBase.get(base) ?? [];
    if (siblings.length === 1) {
      return {
        hardware: siblings[0],
        status: 'resolved',
        method: 'default-vram',
      };
    }
    if (siblings.length > 1 && short === base) {
      const preferred = [...siblings].sort(comparePreferred)[0];
      return {
        hardware: preferred,
        status: 'resolved',
        method: 'default-vram',
      };
    }

    return {
      hardware: null,
      status: 'unresolved',
      reason:
        exact.length > 1 || alias.length > 1 || safe.length > 1
          ? 'Ambiguous exact key'
          : 'No exact normalized or alias match',
    };
  }
}
