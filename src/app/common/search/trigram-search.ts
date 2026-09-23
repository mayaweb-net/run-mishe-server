import { Prisma } from '@/app/db/generated/prisma/client';
import { normalizeHardwareName } from '@/app/common/hardware/normalize-hardware-name';

export type TrigramSearchRow = {
  id: string;
  score: number;
};

const MIN_SIMILARITY = 0.3;

function ilikePattern(value: string): string {
  return `%${value.replace(/[%_\\]/g, '\\$&')}%`;
}

export async function searchCpuIdsByTrigram(
  prisma: Prisma.TransactionClient,
  query: string,
  opts: {
    limit: number;
    offset: number;
    vendor?: string;
    formFactor?: string;
    quality?: string;
  },
): Promise<{ ids: string[]; total: number }> {
  const normalized = normalizeHardwareName(query);
  const raw = query.trim();
  if (!normalized && !raw) {
    return { ids: [], total: 0 };
  }

  const filters = Prisma.sql`
    ${opts.vendor ? Prisma.sql`AND c.vendor = ${opts.vendor}::"vendor"` : Prisma.empty}
    ${opts.formFactor ? Prisma.sql`AND c."formFactor" = ${opts.formFactor}::"form_factor"` : Prisma.empty}
    ${opts.quality ? Prisma.sql`AND c.quality = ${opts.quality}::"data_quality"` : Prisma.empty}
  `;

  const scored = Prisma.sql`
    WITH scored AS (
      SELECT
        c.id,
        GREATEST(
          similarity(c."normalizedName", ${normalized}),
          COALESCE((
            SELECT MAX(similarity(a.alias, ${normalized}))
            FROM hardware_aliases a
            WHERE a."cpuId" = c.id
          ), 0),
          CASE
            WHEN c.name ILIKE ${ilikePattern(raw)} ESCAPE '\\' THEN 0.4
            WHEN c.slug ILIKE ${ilikePattern(raw.toLowerCase())} ESCAPE '\\' THEN 0.35
            ELSE 0
          END
        ) AS score
      FROM cpus c
      WHERE (
        c."normalizedName" % ${normalized}
        OR EXISTS (
          SELECT 1 FROM hardware_aliases a
          WHERE a."cpuId" = c.id AND a.alias % ${normalized}
        )
        OR c.name ILIKE ${ilikePattern(raw)} ESCAPE '\\'
        OR c.slug ILIKE ${ilikePattern(raw.toLowerCase())} ESCAPE '\\'
        OR c."normalizedName" ILIKE ${ilikePattern(normalized)} ESCAPE '\\'
      )
      ${filters}
    )
  `;

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint }>>`
      ${scored}
      SELECT COUNT(*)::bigint AS total FROM scored WHERE score >= ${MIN_SIMILARITY}
    `,
    prisma.$queryRaw<TrigramSearchRow[]>`
      ${scored}
      SELECT id, score FROM scored
      WHERE score >= ${MIN_SIMILARITY}
      ORDER BY score DESC, id ASC
      LIMIT ${opts.limit} OFFSET ${opts.offset}
    `,
  ]);

  return {
    ids: idRows.map((row) => row.id),
    total: Number(countRows[0]?.total ?? 0),
  };
}

export async function searchGpuIdsByTrigram(
  prisma: Prisma.TransactionClient,
  query: string,
  opts: {
    limit: number;
    offset: number;
    vendor?: string;
    formFactor?: string;
    quality?: string;
  },
): Promise<{ ids: string[]; total: number }> {
  const normalized = normalizeHardwareName(query);
  const raw = query.trim();
  if (!normalized && !raw) {
    return { ids: [], total: 0 };
  }

  const filters = Prisma.sql`
    ${opts.vendor ? Prisma.sql`AND g.vendor = ${opts.vendor}::"vendor"` : Prisma.empty}
    ${opts.formFactor ? Prisma.sql`AND g."formFactor" = ${opts.formFactor}::"form_factor"` : Prisma.empty}
    ${opts.quality ? Prisma.sql`AND g.quality = ${opts.quality}::"data_quality"` : Prisma.empty}
  `;

  const scored = Prisma.sql`
    WITH scored AS (
      SELECT
        g.id,
        GREATEST(
          similarity(g."normalizedName", ${normalized}),
          COALESCE((
            SELECT MAX(similarity(a.alias, ${normalized}))
            FROM hardware_aliases a
            WHERE a."gpuId" = g.id
          ), 0),
          CASE
            WHEN g.name ILIKE ${ilikePattern(raw)} ESCAPE '\\' THEN 0.4
            WHEN g.slug ILIKE ${ilikePattern(raw.toLowerCase())} ESCAPE '\\' THEN 0.35
            ELSE 0
          END
        ) AS score
      FROM gpus g
      WHERE (
        g."normalizedName" % ${normalized}
        OR EXISTS (
          SELECT 1 FROM hardware_aliases a
          WHERE a."gpuId" = g.id AND a.alias % ${normalized}
        )
        OR g.name ILIKE ${ilikePattern(raw)} ESCAPE '\\'
        OR g.slug ILIKE ${ilikePattern(raw.toLowerCase())} ESCAPE '\\'
        OR g."normalizedName" ILIKE ${ilikePattern(normalized)} ESCAPE '\\'
      )
      ${filters}
    )
  `;

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint }>>`
      ${scored}
      SELECT COUNT(*)::bigint AS total FROM scored WHERE score >= ${MIN_SIMILARITY}
    `,
    prisma.$queryRaw<TrigramSearchRow[]>`
      ${scored}
      SELECT id, score FROM scored
      WHERE score >= ${MIN_SIMILARITY}
      ORDER BY score DESC, id ASC
      LIMIT ${opts.limit} OFFSET ${opts.offset}
    `,
  ]);

  return {
    ids: idRows.map((row) => row.id),
    total: Number(countRows[0]?.total ?? 0),
  };
}

export async function searchGameIdsByTrigram(
  prisma: Prisma.TransactionClient,
  query: string,
  opts: {
    limit: number;
    offset: number;
    extraWhereSql?: Prisma.Sql;
  },
): Promise<{ ids: string[]; total: number }> {
  const raw = query.trim();
  if (!raw) {
    return { ids: [], total: 0 };
  }

  const pattern = ilikePattern(raw);
  const scored = Prisma.sql`
    WITH scored AS (
      SELECT
        g.id,
        GREATEST(
          similarity(g.name, ${raw}),
          COALESCE(similarity(g."nameFa", ${raw}), 0),
          CASE
            WHEN g.name ILIKE ${pattern} ESCAPE '\\' THEN 0.45
            WHEN g.slug ILIKE ${pattern} ESCAPE '\\' THEN 0.4
            WHEN g."nameFa" ILIKE ${pattern} ESCAPE '\\' THEN 0.4
            WHEN g.developer ILIKE ${pattern} ESCAPE '\\' THEN 0.25
            WHEN g.publisher ILIKE ${pattern} ESCAPE '\\' THEN 0.25
            ELSE 0
          END
        ) AS score
      FROM games g
      WHERE (
        g.name % ${raw}
        OR g.name ILIKE ${pattern} ESCAPE '\\'
        OR g.slug ILIKE ${pattern} ESCAPE '\\'
        OR g."nameFa" ILIKE ${pattern} ESCAPE '\\'
        OR g.developer ILIKE ${pattern} ESCAPE '\\'
        OR g.publisher ILIKE ${pattern} ESCAPE '\\'
      )
      ${opts.extraWhereSql ?? Prisma.empty}
    )
  `;

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint }>>`
      ${scored}
      SELECT COUNT(*)::bigint AS total FROM scored WHERE score >= ${MIN_SIMILARITY}
    `,
    prisma.$queryRaw<TrigramSearchRow[]>`
      ${scored}
      SELECT id, score FROM scored
      WHERE score >= ${MIN_SIMILARITY}
      ORDER BY score DESC, id ASC
      LIMIT ${opts.limit} OFFSET ${opts.offset}
    `,
  ]);

  return {
    ids: idRows.map((row) => row.id),
    total: Number(countRows[0]?.total ?? 0),
  };
}

export function orderByIds<T extends { id: string }>(
  items: T[],
  ids: string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined);
}
