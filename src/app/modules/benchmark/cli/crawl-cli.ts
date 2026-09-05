import { parseArgs } from 'node:util';
import { BenchmarkCrawlerService } from '../crawler-service';
import { loadSeedCatalog } from '../domain/catalog';
import type { BenchmarkSource, HardwareTarget } from '../domain/types';
import { PassMarkCrawler } from '../sources/passmark-crawler';
import { ThreeDMarkCrawler } from '../sources/three-dmark-crawler';

function positiveInteger(
  value: string | undefined,
  name: string,
): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export async function runCrawlCli(target: HardwareTarget): Promise<void> {
  const { values } = parseArgs({
    args: process.argv
      .slice(2)
      .filter((value, index) => value !== '--' || index > 0),
    options: {
      limit: { type: 'string' },
      source: { type: 'string' },
      concurrency: { type: 'string', default: '2' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  const limit = positiveInteger(values.limit, '--limit');
  positiveInteger(values.concurrency, '--concurrency');
  const source = values.source as BenchmarkSource | undefined;
  if (source && source !== 'passmark' && source !== '3dmark') {
    throw new Error('--source must be passmark or 3dmark');
  }
  if (target === 'CPU' && source === '3dmark') {
    throw new Error('3dmark is not a configured CPU benchmark source');
  }

  const catalog = loadSeedCatalog(target, limit);
  console.log(`[${target} CRAWLER]`);
  console.log(`Loaded: ${catalog.length} ${target}s`);

  const adapters = [
    new PassMarkCrawler({
      dryRun: values['dry-run'],
      force: values.force,
    }),
    ...(target === 'GPU' ? [new ThreeDMarkCrawler()] : []),
  ];
  const service = new BenchmarkCrawlerService(
    adapters,
    {
      dryRun: values['dry-run'],
      sources: source ? [source] : undefined,
    },
  );
  const summary = await service.crawl(target, catalog);

  console.log('\nSummary');
  console.log(`  Loaded: ${summary.loaded}`);
  console.log(`  Found: ${summary.found}`);
  console.log(`  Missing: ${summary.missing}`);
  console.log(`  Unresolved: ${summary.unresolved}`);
  console.log(`  Errors: ${summary.errors}`);
  if (values['dry-run']) console.log('  Dry run: no files written');
  for (const file of summary.files) console.log(`  Saved: ${file}`);

  if (summary.errors > 0) process.exitCode = 1;
}
