import 'dotenv/config';

import { parseArgs } from 'node:util';
import {
  buildNbcGameMap,
  unmappedNbcGames,
} from '@/app/modules/estimation/fps-ingest/notebookcheck/game-id-map';
import {
  buildDesktopListUrl,
  closeFpsBrowser,
  fetchNotebookcheckHtml,
} from '@/app/modules/estimation/fps-ingest/notebookcheck/fetch';
import {
  bestNbcLabelMatch,
  parseNbcDesktopList,
  parseNbcGameSelect,
} from '@/app/modules/estimation/fps-ingest/notebookcheck/parse-list';
import {
  writeFpsJsonl,
  writeMissingFpsJsonl,
} from '@/app/modules/estimation/fps-ingest/storage';
import type {
  MissingFpsRecord,
  RawFpsSampleRecord,
} from '@/app/modules/estimation/fps-ingest/types';

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv
      .slice(2)
      .filter((value, index) => value !== '--' || index > 0),
    options: {
      source: { type: 'string', default: 'notebookcheck' },
      'limit-games': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      delay: { type: 'string', default: '1500' },
      channel: { type: 'string' },
      'batch-size': { type: 'string', default: '1' },
    },
  });

  if (values.source !== 'notebookcheck') {
    throw new Error(`Unsupported source: ${values.source}`);
  }

  const limitGames = values['limit-games']
    ? Number(values['limit-games'])
    : undefined;
  const delayMs = Number(values.delay ?? 1500);
  const batchSize = Math.max(1, Number(values['batch-size'] ?? 1));
  const channel = values.channel as 'chrome' | 'msedge' | 'chromium' | undefined;
  const dryRun = Boolean(values['dry-run']);
  const force = Boolean(values.force);

  const catalog = buildNbcGameMap();
  const games = Number.isFinite(limitGames)
    ? catalog.slice(0, limitGames)
    : catalog;

  console.log(
    `NotebookCheck FPS crawl: ${games.length} allowlist titles` +
      ` (${unmappedNbcGames().length} had no static NBC id)` +
      `${dryRun ? ' [dry-run]' : ''}`,
  );

  const capturedAt = new Date();
  const allRecords: RawFpsSampleRecord[] = [];
  const missed: MissingFpsRecord[] = [];

  try {
    // Bootstrap: load the list once to align allowlist names → NBC option ids.
    const bootstrapUrl = buildDesktopListUrl([990]);
    const bootstrap = await fetchNotebookcheckHtml(bootstrapUrl, {
      force,
      channel,
    });
    const selectOptions = parseNbcGameSelect(bootstrap.body);
    console.log(`NBC game select options: ${selectOptions.length}`);

    const resolvedGames = games
      .map((game) => {
        const refined = bestNbcLabelMatch(selectOptions, game.name);
        if (!refined) {
          missed.push({
            source: 'notebookcheck',
            reason: 'no-nbc-id',
            gameSlug: game.slug,
            detail: `No #bl_gameselect match for ${game.name}`,
            checkedAt: capturedAt.toISOString(),
          });
          return null;
        }
        if (game.nbcGameId != null && game.nbcGameId !== refined.nbcGameId) {
          console.log(
            `  id refine ${game.slug}: ${game.nbcGameId} → ${refined.nbcGameId} (${refined.label})`,
          );
        }
        return { ...game, nbcGameId: refined.nbcGameId };
      })
      .filter((game): game is (typeof games)[number] & { nbcGameId: number } =>
        game != null,
      );

    console.log(`Resolved against live select: ${resolvedGames.length}`);

    for (let offset = 0; offset < resolvedGames.length; offset += batchSize) {
      const batch = resolvedGames.slice(offset, offset + batchSize);
      const ids = batch.map((game) => game.nbcGameId);
      const url = buildDesktopListUrl(ids);

      console.log(
        `[${Math.min(offset + batch.length, resolvedGames.length)}/${resolvedGames.length}] ` +
          batch.map((game) => game.slug).join(', '),
      );

      const page =
        offset === 0 && batchSize === 1 && batch[0]?.nbcGameId === 990
          ? bootstrap
          : await fetchNotebookcheckHtml(url, { force, channel });
      if (page.status >= 400) {
        for (const game of batch) {
          missed.push({
            source: 'notebookcheck',
            reason: 'empty-table',
            gameSlug: game.slug,
            nbcGameId: game.nbcGameId,
            detail: `HTTP ${page.status}`,
            checkedAt: capturedAt.toISOString(),
          });
        }
        continue;
      }

      for (const game of batch) {
        const rows = parseNbcDesktopList(page.body, {
          gameSlug: game.slug,
          nbcGameId: game.nbcGameId,
          sourceUrl: page.finalUrl ?? page.url,
          capturedAt: page.capturedAt,
          allowedGameIds: new Set([game.nbcGameId]),
        });

        if (rows.length === 0) {
          missed.push({
            source: 'notebookcheck',
            reason: 'empty-table',
            gameSlug: game.slug,
            nbcGameId: game.nbcGameId,
            detail: 'No median FPS cells parsed',
            checkedAt: capturedAt.toISOString(),
          });
          console.log(`  ${game.slug}: 0 rows`);
        } else {
          allRecords.push(...rows);
          console.log(`  ${game.slug}: ${rows.length} rows`);
        }
      }

      if (offset + batchSize < resolvedGames.length && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } finally {
    await closeFpsBrowser();
  }

  console.log(`\nParsed ${allRecords.length} FPS rows, ${missed.length} missed`);

  if (dryRun) {
    const byGame = new Map<string, number>();
    for (const row of allRecords) {
      byGame.set(row.gameSlug, (byGame.get(row.gameSlug) ?? 0) + 1);
    }
    console.log('Per-game counts (dry-run, not written):');
    for (const [slug, count] of [...byGame.entries()].sort()) {
      console.log(`  ${slug}: ${count}`);
    }
    return;
  }

  const jsonlPath = await writeFpsJsonl(
    'notebookcheck',
    allRecords,
    capturedAt,
  );
  const missedPath = await writeMissingFpsJsonl(
    'notebookcheck',
    missed,
    capturedAt,
  );
  console.log(`Wrote ${jsonlPath}`);
  console.log(`Wrote ${missedPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
