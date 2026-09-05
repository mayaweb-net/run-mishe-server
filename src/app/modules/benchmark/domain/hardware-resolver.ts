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

export class HardwareResolver {
  private readonly normalized = new Map<string, CatalogHardware[]>();
  private readonly aliases = new Map<string, CatalogHardware[]>();
  private readonly safe = new Map<string, CatalogHardware[]>();

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

    const safe = this.safe.get(safeShortName(sourceName, this.target)) ?? [];
    if (safe.length === 1) {
      return {
        hardware: safe[0],
        status: 'resolved',
        method: 'safe-normalization',
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
