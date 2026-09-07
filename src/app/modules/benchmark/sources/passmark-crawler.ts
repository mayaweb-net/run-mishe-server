import {
  HardwareResolver,
  safeShortName,
  stripVramToken,
} from '../domain/hardware-resolver';
import type {
  CatalogHardware,
  HardwareTarget,
  RawBenchmarkRecord,
  SourceCrawlResult,
} from '../domain/types';
import type { BenchmarkCrawler } from './benchmark-crawler';
import { CachedHttpClient, type HttpClientOptions } from './http-client';
import {
  parsePassMarkCpuMark,
  parsePassMarkCpuDetail,
  parsePassMarkG3d,
  parsePassMarkGpuDetail,
  parsePassMarkSingleThread,
} from './passmark-parser';

const INTEL_CPU_MARK_URL = 'https://www.cpubenchmark.net/cpu-list/';
const AMD_CPU_MARK_URL = 'https://www.cpubenchmark.net/cpu-list/amd/';
const SINGLE_THREAD_URL = 'https://www.cpubenchmark.net/singleThread.html';
const G3D_URL = 'https://www.videocardbenchmark.net/gpu_list.php';

function resolvedRecordMap(
  records: readonly RawBenchmarkRecord[],
  resolver: HardwareResolver,
): Map<string, RawBenchmarkRecord> {
  const candidates = new Map<string, RawBenchmarkRecord[]>();
  for (const record of records) {
    const hardware = resolver.resolve(record.hardwareName).hardware;
    if (!hardware) continue;
    const key = `${hardware.slug}:${record.benchmark}`;
    const rows = candidates.get(key) ?? [];
    rows.push(record);
    candidates.set(key, rows);
  }

  const resolved = new Map<string, RawBenchmarkRecord>();
  for (const [key, rows] of candidates) {
    const scores = new Set(rows.map((row) => Number(row.score)));
    if (scores.size === 1) resolved.set(key, rows[0]);
    else {
      const clockQualified = rows.filter((row) =>
        /\s@\s*\d+(?:\.\d+)?\s*GHz\b/i.test(row.hardwareName),
      );
      if (clockQualified.length === 1) resolved.set(key, clockQualified[0]);
    }
  }
  return resolved;
}

/**
 * When PassMark lists a bare SKU (e.g. "RTX 4060 Ti") and a VRAM sibling
 * ("RTX 4060 Ti 16GB"), assign the bare row to the single remaining catalog
 * VRAM variant that has no exact PassMark counterpart.
 */
export function assignDefaultVramGpuMatches(
  catalog: readonly CatalogHardware[],
  sourceRecords: readonly RawBenchmarkRecord[],
  resolved: Map<string, RawBenchmarkRecord>,
): void {
  const byBase = new Map<string, RawBenchmarkRecord[]>();
  for (const record of sourceRecords) {
    if (record.benchmark !== 'passmark-g3d-mark') continue;
    const base = stripVramToken(safeShortName(record.hardwareName, 'GPU'));
    if (!base) continue;
    const rows = byBase.get(base) ?? [];
    rows.push(record);
    byBase.set(base, rows);
  }

  const catalogByBase = new Map<string, CatalogHardware[]>();
  for (const hardware of catalog) {
    const base = stripVramToken(safeShortName(hardware.name, 'GPU'));
    if (!base) continue;
    const rows = catalogByBase.get(base) ?? [];
    rows.push(hardware);
    catalogByBase.set(base, rows);
  }

  for (const [base, siblings] of catalogByBase) {
    const sourceRows = byBase.get(base) ?? [];
    if (sourceRows.length === 0) continue;

    const bareSources = sourceRows.filter(
      (row) =>
        stripVramToken(safeShortName(row.hardwareName, 'GPU')) ===
        safeShortName(row.hardwareName, 'GPU'),
    );
    if (bareSources.length !== 1) continue;

    const exactSourceKeys = new Set(
      sourceRows
        .map((row) => safeShortName(row.hardwareName, 'GPU'))
        .filter((name) => name !== base),
    );

    const remaining = siblings.filter((hardware) => {
      const key = `${hardware.slug}:passmark-g3d-mark`;
      if (resolved.has(key)) return false;
      const short = safeShortName(hardware.name, 'GPU');
      if (short === base) return false;
      return !exactSourceKeys.has(short);
    });

    if (remaining.length !== 1) continue;
    const target = remaining[0];
    resolved.set(`${target.slug}:passmark-g3d-mark`, {
      ...bareSources[0],
      // Rewrite to the catalog name so downstream re-resolution stays exact.
      hardwareName: target.name,
      rawPayload: {
        ...(bareSources[0].rawPayload &&
        typeof bareSources[0].rawPayload === 'object'
          ? bareSources[0].rawPayload
          : {}),
        passmarkHardwareName: bareSources[0].hardwareName,
        matchedBy: 'default-vram',
      },
    });
  }
}

/**
 * PassMark sometimes publishes one score for several near-identical chips.
 * Explicit allowlist only — never invent slash combinations.
 */
export function assignCombinedGpuMatches(
  catalog: readonly CatalogHardware[],
  sourceRecords: readonly RawBenchmarkRecord[],
  resolved: Map<string, RawBenchmarkRecord>,
): void {
  const rules: Array<{
    sourcePattern: RegExp;
    catalogSlugs: readonly string[];
  }> = [
    {
      sourcePattern: /^radeon rx 470\/570$/i,
      catalogSlugs: ['amd-radeon-rx-470', 'amd-radeon-rx-570'],
    },
    {
      sourcePattern: /^radeon hd 7970\s*\/\s*r9 280x$/i,
      catalogSlugs: ['amd-radeon-hd-7970'],
    },
  ];

  const bySlug = new Map(catalog.map((row) => [row.slug, row]));
  for (const record of sourceRecords) {
    if (record.benchmark !== 'passmark-g3d-mark') continue;
    for (const rule of rules) {
      if (!rule.sourcePattern.test(record.hardwareName.trim())) continue;
      for (const slug of rule.catalogSlugs) {
        const hardware = bySlug.get(slug);
        if (!hardware) continue;
        const key = `${slug}:passmark-g3d-mark`;
        if (resolved.has(key)) continue;
        resolved.set(key, {
          ...record,
          hardwareName: hardware.name,
          rawPayload: {
            ...(record.rawPayload && typeof record.rawPayload === 'object'
              ? record.rawPayload
              : {}),
            passmarkHardwareName: record.hardwareName,
            matchedBy: 'combined-passmark',
          },
        });
      }
    }
  }
}

function cpuDetailQueries(name: string): string[] {
  return [
    ...new Set([
      name,
      name.replace(/\bA-Series\s+/i, ''),
      name.replace(/\bAMD\s+FX\s+FX\s+/i, 'AMD FX-'),
      name.replace(/\bAMD\s+A\s+(\d+)\s+/i, 'AMD A$1-'),
      name.replace(/\s+OEM\s*\/?\s*$/i, ''),
    ]),
  ];
}

function gpuDetailQueries(name: string): string[] {
  const stripped = name.replace(/^(?:NVIDIA|AMD|Intel)\s+/i, '').trim();
  return [
    ...new Set([
      stripped,
      stripped.replace(/\s+Max-Q$/i, ' with Max-Q Design'),
      stripped.replace(/\s+Mobile$/i, ' (Mobile)'),
      stripped.replace(/\s+Mobile$/i, ' Laptop GPU'),
      `${stripped} Laptop GPU`,
      stripped.replace(/\s+\d+\s*GB$/i, ''),
      stripped.replace(/\s+(?:Limited|Founders)(?:\s+Edition)?\b/gi, ''),
      stripped.replace(/\s+TiM$/i, ' Ti Laptop GPU'),
    ]),
  ].filter(Boolean);
}

export class PassMarkCrawler implements BenchmarkCrawler {
  readonly source = 'passmark' as const;
  private readonly http: CachedHttpClient;

  constructor(options: HttpClientOptions = {}) {
    this.http = new CachedHttpClient(options);
  }

  async crawl(
    target: HardwareTarget,
    catalog: readonly CatalogHardware[],
  ): Promise<SourceCrawlResult> {
    const errors: string[] = [];
    try {
      if (target === 'CPU') {
        const intelCpuMark = await this.http.get(INTEL_CPU_MARK_URL);
        const amdCpuMark = await this.http.get(AMD_CPU_MARK_URL);
        const singleThread = await this.http.get(SINGLE_THREAD_URL);
        const intelCpuMarkRecords = parsePassMarkCpuMark(
          intelCpuMark.body,
          intelCpuMark.url,
          intelCpuMark.capturedAt,
        );
        const amdCpuMarkRecords = parsePassMarkCpuMark(
          amdCpuMark.body,
          amdCpuMark.url,
          amdCpuMark.capturedAt,
        );
        const cpuMarkRecords = [...intelCpuMarkRecords, ...amdCpuMarkRecords];
        const singleThreadRecords = parsePassMarkSingleThread(
          singleThread.body,
          singleThread.url,
          singleThread.capturedAt,
        );
        if (
          intelCpuMarkRecords.length === 0 ||
          amdCpuMarkRecords.length === 0 ||
          singleThreadRecords.length === 0
        ) {
          throw new Error(
            'PassMark CPU page structure changed or returned no benchmark rows',
          );
        }
        const resolver = new HardwareResolver(catalog, 'CPU');
        const resolved = resolvedRecordMap(
          [...cpuMarkRecords, ...singleThreadRecords],
          resolver,
        );
        await this.enrichCpuDetails(catalog, resolver, resolved, errors);
        return {
          source: this.source,
          records: [...resolved.values()],
          errors,
        };
      }

      const response = await this.http.get(G3D_URL);
      const records = parsePassMarkG3d(
        response.body,
        response.url,
        response.capturedAt,
      );
      if (records.length === 0) {
        throw new Error(
          'PassMark GPU page structure changed or returned no benchmark rows',
        );
      }
      const resolver = new HardwareResolver(catalog, 'GPU');
      const resolved = resolvedRecordMap(records, resolver);
      assignDefaultVramGpuMatches(catalog, records, resolved);
      assignCombinedGpuMatches(catalog, records, resolved);
      await this.enrichGpuDetails(catalog, resolver, resolved, errors);
      return {
        source: this.source,
        records: [...resolved.values()],
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return { source: this.source, records: [], errors };
    }
  }

  private async enrichCpuDetails(
    catalog: readonly CatalogHardware[],
    resolver: HardwareResolver,
    records: Map<string, RawBenchmarkRecord>,
    errors: string[],
  ): Promise<void> {
    for (const hardware of catalog) {
      const missing = new Set(
        ['passmark-cpu-mark', 'passmark-single-thread'].filter(
          (benchmark) => !records.has(`${hardware.slug}:${benchmark}`),
        ),
      );
      if (missing.size === 0) continue;

      const urls = cpuDetailQueries(hardware.name).map(
        (query) =>
          `https://www.cpubenchmark.net/cpu.php?cpu=${encodeURIComponent(query)}`,
      );
      for (const url of new Set(urls)) {
        try {
          const response = await this.http.get(url);
          const detail = parsePassMarkCpuDetail(
            response.body,
            response.finalUrl ?? response.url,
            response.capturedAt,
          );
          for (const record of detail) {
            const resolved = resolver.resolve(record.hardwareName).hardware;
            if (
              resolved?.slug === hardware.slug &&
              missing.has(record.benchmark)
            ) {
              records.set(`${hardware.slug}:${record.benchmark}`, record);
              missing.delete(record.benchmark);
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (!message.startsWith('HTTP 404')) errors.push(message);
        }
        if (missing.size === 0) break;
      }
    }
  }

  private async enrichGpuDetails(
    catalog: readonly CatalogHardware[],
    resolver: HardwareResolver,
    records: Map<string, RawBenchmarkRecord>,
    errors: string[],
  ): Promise<void> {
    for (const hardware of catalog) {
      const key = `${hardware.slug}:passmark-g3d-mark`;
      if (records.has(key)) continue;

      for (const query of gpuDetailQueries(hardware.name)) {
        const url = `https://www.videocardbenchmark.net/gpu.php?gpu=${encodeURIComponent(query)}`;
        try {
          const response = await this.http.get(url);
          const detail = parsePassMarkGpuDetail(
            response.body,
            response.finalUrl ?? response.url,
            response.capturedAt,
          )[0];
          if (!detail) continue;
          const resolved = resolver.resolve(detail.hardwareName).hardware;
          if (resolved?.slug === hardware.slug) {
            records.set(key, detail);
            break;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (!message.startsWith('HTTP 404')) errors.push(message);
        }
      }
    }
  }
}
