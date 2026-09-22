import { chromium, type Browser } from 'playwright';
import {
  readCachedHtml,
  writeCachedHtml,
} from '../storage';
import type { CachedHtmlResponse } from '../types';

export interface FetchHtmlOptions {
  force?: boolean;
  /** Prefer system Chrome/Edge when Playwright's Chromium bundle is missing. */
  channel?: 'chrome' | 'msedge' | 'chromium';
}

let sharedBrowser: Browser | null = null;

async function launchBrowser(
  channel?: FetchHtmlOptions['channel'],
): Promise<Browser> {
  if (sharedBrowser) return sharedBrowser;

  const attempts: Array<{ channel?: 'chrome' | 'msedge' }> = [];
  if (channel === 'chrome' || channel === 'msedge') {
    attempts.push({ channel });
  } else if (channel === 'chromium') {
    attempts.push({});
  } else {
    // Default: bundled chromium, then system browsers.
    attempts.push({}, { channel: 'chrome' }, { channel: 'msedge' });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      sharedBrowser = await chromium.launch({
        headless: true,
        channel: attempt.channel,
      });
      return sharedBrowser;
    } catch (error) {
      errors.push(
        `${attempt.channel ?? 'chromium'}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  throw new Error(
    `Failed to launch Playwright browser. Tried: ${errors.join(' | ')}. ` +
      `Run \`pnpm exec playwright install chromium\` or install Google Chrome.`,
  );
}

export async function closeFpsBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export async function fetchNotebookcheckHtml(
  url: string,
  options: FetchHtmlOptions = {},
): Promise<CachedHtmlResponse> {
  if (!options.force) {
    const cached = await readCachedHtml(url);
    if (cached) return cached;
  }

  const browser = await launchBrowser(options.channel);
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    // Wait for either the games table or the select — page may be slow.
    await page
      .waitForSelector('table.sortable, #bl_gameselect', { timeout: 45_000 })
      .catch(() => undefined);
    const body = await page.content();
    const status = response?.status() ?? 0;
    const payload: CachedHtmlResponse = {
      url,
      finalUrl: page.url(),
      capturedAt: new Date().toISOString(),
      status,
      body,
    };
    await writeCachedHtml(payload);
    return payload;
  } finally {
    await page.close();
  }
}

export function buildDesktopListUrl(nbcGameIds: readonly number[]): string {
  const params = new URLSearchParams();
  for (const id of nbcGameIds) {
    params.append('gameselect[]', String(id));
  }
  // 1,2,3,4,6,7 = Low/Med/High/Ultra 1080 + QHD Ultra + 4K Ultra
  for (const settingsClass of [1, 2, 3, 4, 6, 7]) {
    params.append('settings_class_array[]', String(settingsClass));
  }
  params.set('deskornote', '1');
  params.set('professional', '2');
  params.set('multiplegpus', '1');
  return `https://www.notebookcheck.net/Ranking-of-desktop-GPUs-in-demanding-PC-games.1082241.0.html?${params.toString()}`;
}
