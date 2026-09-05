import {
  readCachedResponse,
  writeCachedResponse,
  type CachedResponse,
} from '../storage/raw-storage';

const DEFAULT_USER_AGENT =
  'RunMisheBenchmarkCrawler/1.0 (+https://runmishe.com; benchmark provenance collection)';

export interface HttpClientOptions {
  timeoutMs?: number;
  retries?: number;
  minDelayMs?: number;
  force?: boolean;
  dryRun?: boolean;
  userAgent?: string;
}

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class CachedHttpClient {
  private lastRequestAt = 0;

  constructor(private readonly options: HttpClientOptions = {}) {}

  async get(url: string): Promise<CachedResponse> {
    if (!this.options.force) {
      const cached = await readCachedResponse(url);
      if (cached) return cached;
    }

    const minDelayMs = this.options.minDelayMs ?? 2_000;
    const wait = minDelayMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await sleep(wait);

    const retries = this.options.retries ?? 2;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.timeoutMs ?? 20_000,
      );
      try {
        this.lastRequestAt = Date.now();
        const response = await fetch(url, {
          headers: {
            accept: 'text/html,application/xhtml+xml,application/json',
            'user-agent': this.options.userAgent ?? DEFAULT_USER_AGENT,
          },
          signal: controller.signal,
        });
        const cached: CachedResponse = {
          url,
          finalUrl: response.url,
          capturedAt: new Date().toISOString(),
          status: response.status,
          contentType: response.headers.get('content-type'),
          body: await response.text(),
        };
        if (!response.ok) {
          if (response.status < 500 && response.status !== 429) {
            throw new Error(`HTTP ${response.status} for ${url}`);
          }
          throw new TransientHttpError(`HTTP ${response.status} for ${url}`);
        }
        if (!this.options.dryRun) await writeCachedResponse(cached);
        return cached;
      } catch (error) {
        lastError = error;
        const transient =
          error instanceof TransientHttpError ||
          (error instanceof Error && error.name === 'AbortError');
        if (!transient || attempt === retries) break;
        await sleep(500 * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

class TransientHttpError extends Error {}
