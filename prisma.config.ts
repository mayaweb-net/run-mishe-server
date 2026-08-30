import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'src/app/db/prisma',
  migrations: {
    path: 'src/app/db/prisma/migrations',
    seed: 'tsx --tsconfig tsconfig.json src/app/db/prisma/seed/seed.ts',
  },
  datasource: {
    url:
      process.env['DATABASE_URL'] ??
      'postgresql://run-mishe:run-mishe@localhost:5434/run-mishe',
  },
});
