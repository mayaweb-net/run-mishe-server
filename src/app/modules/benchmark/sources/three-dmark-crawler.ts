import type { HardwareTarget, SourceCrawlResult } from '../domain/types';
import type { BenchmarkCrawler } from './benchmark-crawler';

const UNAVAILABLE =
  'No official representative per-GPU Time Spy dataset is configured. ' +
  'Hall of Fame results and UL component-based estimates are intentionally not imported.';

export class ThreeDMarkCrawler implements BenchmarkCrawler {
  readonly source = '3dmark' as const;

  async crawl(_target: HardwareTarget): Promise<SourceCrawlResult> {
    return {
      source: this.source,
      records: [],
      unavailable: UNAVAILABLE,
      errors: [],
    };
  }
}
