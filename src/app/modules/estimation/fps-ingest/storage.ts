import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  CachedHtmlResponse,
  MissingFpsRecord,
  RawFpsSampleRecord,
} from './types';

export const FPS_DATA_ROOT = join(process.cwd(), 'data', 'fps');

function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export async function readCachedHtml(
  url: string,
): Promise<CachedHtmlResponse | null> {
  const path = join(FPS_DATA_ROOT, 'cache', `${cacheKey(url)}.json`);
  try {
    return JSON.parse(await readFile(path, 'utf8')) as CachedHtmlResponse;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeCachedHtml(
  response: CachedHtmlResponse,
): Promise<string> {
  const path = join(FPS_DATA_ROOT, 'cache', `${cacheKey(response.url)}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(response), 'utf8');
  return path;
}

export async function writeFpsJsonl(
  source: string,
  records: readonly RawFpsSampleRecord[],
  capturedAt: Date,
): Promise<string> {
  const date = capturedAt.toISOString().slice(0, 10);
  const path = join(FPS_DATA_ROOT, source, `${date}.jsonl`);
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

export async function writeMissingFpsJsonl(
  source: string,
  records: readonly MissingFpsRecord[],
  checkedAt: Date,
): Promise<string> {
  const date = checkedAt.toISOString().slice(0, 10);
  const path = join(FPS_DATA_ROOT, 'missed', source, `${date}.jsonl`);
  await mkdir(dirname(path), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join('\n');
  await writeFile(path, body ? `${body}\n` : '', 'utf8');
  return path;
}

export async function readFpsJsonl(path: string): Promise<unknown[]> {
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
