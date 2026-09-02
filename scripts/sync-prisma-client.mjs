import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(rootDir, 'src/app/db/generated/prisma');
const targetDir = join(rootDir, 'dist/app/db/generated/prisma');

if (!existsSync(sourceDir)) {
  console.warn('[prisma:sync-dist] Generated client missing. Run `npm run prisma:generate` first.');
  process.exit(0);
}

mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true, force: true });
console.log('[prisma:sync-dist] Copied Prisma client to dist.');
