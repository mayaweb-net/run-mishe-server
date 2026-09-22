import 'dotenv/config';

import { readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/app/db/generated/prisma/client';
import { FpsImporter } from '@/app/modules/estimation/fps-ingest/fps-importer';
import {
  FPS_DATA_ROOT,
  readFpsJsonl,
  writeMissingFpsJsonl,
} from '@/app/modules/estimation/fps-ingest/storage';

async function defaultFiles(): Promise<string[]> {
  try {
    const entries = await readdir(FPS_DATA_ROOT, {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.jsonl') &&
          !entry.parentPath.includes(`${sep}missed`) &&
          !entry.parentPath.includes(`${sep}cache`),
      )
      .map((entry) => join(entry.parentPath, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv
      .slice(2)
      .filter((value, index) => value !== '--' || index > 0),
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      'top-gpus': { type: 'string', default: '60' },
    },
  });

  const files =
    positionals.length > 0
      ? positionals.map((file) =>
          isAbsolute(file) ? file : resolve(process.cwd(), file),
        )
      : await defaultFiles();
  if (files.length === 0) {
    throw new Error(
      'No FPS JSONL files found under data/fps/. Run pnpm crawler:fps first.',
    );
  }

  const records = (
    await Promise.all(files.map((file) => readFpsJsonl(file)))
  ).flat();

  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://run-mishe:run-mishe@localhost:55432/run-mishe';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const importer = new FpsImporter(prisma, {
      dryRun: values['dry-run'],
      topGpuLimit: Number(values['top-gpus'] ?? 60),
    });
    const { summary, missed } = await importer.import(records);
    console.log('\nFPS import completed');
    console.log(JSON.stringify(summary, null, 2));
    if (missed.length > 0 && !values['dry-run']) {
      const path = await writeMissingFpsJsonl(
        'notebookcheck-import',
        missed,
        new Date(),
      );
      console.log(`Wrote import misses: ${path} (${missed.length})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
