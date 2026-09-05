import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  BenchmarkSource,
  HardwareTarget,
  MissingBenchmarkRecord,
  RawBenchmarkRecord,
} from '../domain/types';

export const BENCHMARK_DATA_ROOT = join(process.cwd(), 'data', 'benchmarks');

function sourceDirectory(source: BenchmarkSource): string {
  return source === '3dmark' ? '3dmark' : 'passmark';
}

function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export interface CachedResponse {
  url: string;
  finalUrl?: string;
  capturedAt: string;
  status: number;
  contentType: string | null;
  body: string;
}

export async function readCachedResponse(
  url: string,
): Promise<CachedResponse | null> {
  const path = join(BENCHMARK_DATA_ROOT, 'cache', `${cacheKey(url)}.json`);
  try {
    return JSON.parse(await readFile(path, 'utf8')) as CachedResponse;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeCachedResponse(
  response: CachedResponse,
): Promise<string> {
  const path = join(
    BENCHMARK_DATA_ROOT,
    'cache',
    `${cacheKey(response.url)}.json`,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(response), 'utf8');
  return path;
}

export async function writeBenchmarkJsonl(
  target: HardwareTarget,
  source: BenchmarkSource,
  records: readonly RawBenchmarkRecord[],
  capturedAt: Date,
): Promise<string> {
  const date = capturedAt.toISOString().slice(0, 10);
  const path = join(
    BENCHMARK_DATA_ROOT,
    target.toLowerCase(),
    sourceDirectory(source),
    `${date}.jsonl`,
  );
  await mkdir(dirname(path), { recursive: true });
  let existing = new Set<string>();
  try {
    existing = new Set(
      (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const body = records
    .map((record) => JSON.stringify(record))
    .filter((line) => !existing.has(line))
    .join('\n');
  if (body) await appendFile(path, `${body}\n`, 'utf8');
  return path;
}

export async function writeMissingBenchmarkJsonl(
  target: HardwareTarget,
  source: BenchmarkSource,
  records: readonly MissingBenchmarkRecord[],
  checkedAt: Date,
): Promise<string> {
  const date = checkedAt.toISOString().slice(0, 10);
  const path = join(
    BENCHMARK_DATA_ROOT,
    target.toLowerCase(),
    'missed',
    sourceDirectory(source),
    `${date}.jsonl`,
  );
  await mkdir(dirname(path), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join('\n');
  await writeFile(path, body ? `${body}\n` : '', 'utf8');
  return path;
}

export async function readBenchmarkJsonl(path: string): Promise<unknown[]> {
  const body = await readFile(path, 'utf8');
  return body
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`Invalid JSON on line ${index + 1} of ${path}`);
      }
    });
}
