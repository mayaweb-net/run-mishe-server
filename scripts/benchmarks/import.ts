import 'dotenv/config';

import { readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/app/db/generated/prisma/client';
import { seedBenchmarks } from '@/app/db/prisma/seed/benchmarks';
import {
  getBenchmarkDefinition,
  isBenchmarkSlug,
} from '@/app/modules/benchmark/domain/definitions';
import { BenchmarkImporter } from '@/app/modules/benchmark/importer/benchmark-importer';
import {
  BENCHMARK_DATA_ROOT,
  readBenchmarkJsonl,
} from '@/app/modules/benchmark/storage/raw-storage';

async function defaultFiles(): Promise<string[]> {
  try {
    const entries = await readdir(BENCHMARK_DATA_ROOT, {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.jsonl') &&
          !entry.parentPath.includes(`${sep}missed`),
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
    },
  });
  const files =
    positionals.length > 0
      ? positionals.map((file) =>
          isAbsolute(file) ? file : resolve(process.cwd(), file),
        )
      : await defaultFiles();
  if (files.length === 0) {
    throw new Error('No benchmark JSONL files found');
  }

  const records = (
    await Promise.all(files.map((file) => readBenchmarkJsonl(file)))
  ).flat();
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://run-mishe:run-mishe@localhost:55432/run-mishe';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    if (!values['dry-run']) await seedBenchmarks(prisma);
    const importer = new BenchmarkImporter(prisma, {
      dryRun: values['dry-run'],
    });
    const grouped = {
      CPU: [] as unknown[],
      GPU: [] as unknown[],
      invalid: [] as unknown[],
    };
    for (const record of records) {
      const benchmark =
        record && typeof record === 'object' && 'benchmark' in record
          ? String(record.benchmark)
          : '';
      if (!isBenchmarkSlug(benchmark)) grouped.invalid.push(record);
      else grouped[getBenchmarkDefinition(benchmark).target].push(record);
    }
    const cpu = await importer.import(grouped.CPU);
    const gpu = await importer.import(grouped.GPU);
    const invalid =
      grouped.invalid.length > 0
        ? await importer.import(grouped.invalid)
        : null;
    console.log('\nImport batch completed');
    for (const [target, summary] of [
      ['CPU', cpu],
      ['GPU', gpu],
    ] as const) {
      console.log(`\n${target}:`);
      for (const [name, count] of Object.entries(summary)) {
        console.log(`  ${name}: ${count}`);
      }
    }
    if (invalid) {
      console.log('\nInvalid/unknown:');
      for (const [name, count] of Object.entries(invalid)) {
        console.log(`  ${name}: ${count}`);
      }
    }
    if (values['dry-run']) console.log('  Dry run: no database writes');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
