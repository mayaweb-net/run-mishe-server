import { HardwareResolver } from './domain/hardware-resolver';
import { BENCHMARK_DEFINITIONS } from './domain/definitions';
import type {
  BenchmarkSource,
  CatalogHardware,
  CrawlSummary,
  HardwareTarget,
} from './domain/types';
import type { BenchmarkCrawler } from './sources/benchmark-crawler';
import {
  writeBenchmarkJsonl,
  writeMissingBenchmarkJsonl,
} from './storage/raw-storage';

export interface CrawlerServiceOptions {
  dryRun?: boolean;
  sources?: readonly BenchmarkSource[];
}

export class BenchmarkCrawlerService {
  constructor(
    private readonly adapters: readonly BenchmarkCrawler[],
    private readonly options: CrawlerServiceOptions = {},
  ) {}

  async crawl(
    target: HardwareTarget,
    catalog: readonly CatalogHardware[],
  ): Promise<CrawlSummary> {
    const resolver = new HardwareResolver(catalog, target);
    const expectedBenchmarks = BENCHMARK_DEFINITIONS.filter(
      (definition) =>
        definition.target === target &&
        (!this.options.sources ||
          this.options.sources.includes(definition.source)),
    );
    const matchedKeys = new Set<string>();
    const unavailableSources = new Set<BenchmarkSource>();
    const files: string[] = [];
    let errors = 0;

    for (const adapter of this.adapters) {
      if (
        this.options.sources &&
        !this.options.sources.includes(adapter.source)
      ) {
        continue;
      }

      console.log(`\n${adapter.source}`);
      const result = await adapter.crawl(target, catalog);
      errors += result.errors.length;
      for (const message of result.errors) console.error(`  Error: ${message}`);
      if (result.unavailable)
        console.warn(`  Unavailable: ${result.unavailable}`);
      if (result.unavailable || result.errors.length > 0) {
        unavailableSources.add(result.source);
      }

      const records = result.records.filter((record) => {
        const resolution = resolver.resolve(record.hardwareName);
        if (!resolution.hardware) return false;
        matchedKeys.add(`${resolution.hardware.slug}:${record.benchmark}`);
        return true;
      });

      if (!this.options.dryRun && records.length > 0) {
        files.push(
          await writeBenchmarkJsonl(
            target,
            result.source,
            records,
            new Date(records[0].capturedAt),
          ),
        );
      }

      console.log(`  Found: ${records.length}`);
      console.log(`  Errors: ${result.errors.length}`);
    }

    const checkedAt = new Date();
    const missingRecords = catalog.flatMap((hardware) =>
      expectedBenchmarks
        .filter(
          (definition) =>
            !matchedKeys.has(`${hardware.slug}:${definition.slug}`),
        )
        .map((definition) => ({
          target,
          hardwareSlug: hardware.slug,
          hardwareName: hardware.name,
          normalizedName: hardware.normalizedName,
          benchmark: definition.slug,
          source: definition.source,
          checkedAt: checkedAt.toISOString(),
          reason: unavailableSources.has(definition.source)
            ? ('source-unavailable' as const)
            : ('not-found' as const),
        })),
    );
    if (!this.options.dryRun) {
      for (const source of new Set(
        missingRecords.map((record) => record.source),
      )) {
        files.push(
          await writeMissingBenchmarkJsonl(
            target,
            source,
            missingRecords.filter((record) => record.source === source),
            checkedAt,
          ),
        );
      }
    }

    return {
      loaded: catalog.length,
      found: matchedKeys.size,
      missing: missingRecords.length,
      unresolved: 0,
      errors,
      files,
    };
  }
}
