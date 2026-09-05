import type {
  CatalogHardware,
  HardwareTarget,
  SourceCrawlResult,
} from '../domain/types';

export interface BenchmarkCrawler {
  readonly source: SourceCrawlResult['source'];
  crawl(
    target: HardwareTarget,
    catalog: readonly CatalogHardware[],
  ): Promise<SourceCrawlResult>;
}
