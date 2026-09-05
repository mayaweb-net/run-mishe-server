import type { BenchmarkSlug, RawBenchmarkRecord } from '../domain/types';

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) => named[name] ?? entity);
}

function text(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function numeric(value: string): number | null {
  const cleaned = text(value).replace(/[,$*]/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTable(
  html: string,
  benchmark: BenchmarkSlug,
  sourceUrl: string,
  capturedAt: string,
): RawBenchmarkRecord[] {
  const records: RawBenchmarkRecord[] = [];
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (match) => match[1],
    );
    if (cells.length < 3) continue;

    const anchor = cells[0].match(
      /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    const hardwareName = text(anchor?.[2] ?? cells[0]);
    const score = numeric(cells[1]);
    const rank = numeric(cells[2]);
    if (!hardwareName || score == null) continue;
    const detailUrl = anchor
      ? new URL(decodeHtml(anchor[1]), sourceUrl).toString()
      : sourceUrl;

    records.push({
      source: 'passmark',
      benchmark,
      sourceUrl: detailUrl,
      capturedAt,
      hardwareName,
      score,
      rank: rank == null ? undefined : Math.trunc(rank),
      unit: 'points',
      rawPayload: {
        cells: cells.map(text),
        rowHtml: row[0],
      },
    });
  }
  return records;
}

export function parsePassMarkCpuMark(
  html: string,
  sourceUrl: string,
  capturedAt: string,
): RawBenchmarkRecord[] {
  return parseTable(html, 'passmark-cpu-mark', sourceUrl, capturedAt);
}

export function parsePassMarkG3d(
  html: string,
  sourceUrl: string,
  capturedAt: string,
): RawBenchmarkRecord[] {
  return parseTable(html, 'passmark-g3d-mark', sourceUrl, capturedAt);
}

export function parsePassMarkSingleThread(
  html: string,
  sourceUrl: string,
  capturedAt: string,
): RawBenchmarkRecord[] {
  const records = new Map<string, RawBenchmarkRecord>();
  for (const row of html.matchAll(
    /<li\s+id="rk(\d+)"[^>]*>([\s\S]*?)<\/li>/gi,
  )) {
    const name = row[2].match(
      /<span\s+class="prdname"[^>]*>([\s\S]*?)<\/span>/i,
    );
    const score = row[2].match(
      /<span\s+class="count"[^>]*>([\s\S]*?)<\/span>/i,
    );
    const hardwareName = text(name?.[1] ?? '');
    const parsedScore = numeric(score?.[1] ?? '');
    if (!hardwareName || parsedScore == null) continue;

    const key = hardwareName.toLowerCase();
    if (!records.has(key)) {
      records.set(key, {
        source: 'passmark',
        benchmark: 'passmark-single-thread',
        sourceUrl,
        capturedAt,
        hardwareName,
        score: parsedScore,
        rank: Number(row[1]),
        unit: 'points',
        rawPayload: { rowHtml: row[0] },
      });
    }
  }
  return [...records.values()];
}

export function parsePassMarkCpuDetail(
  html: string,
  sourceUrl: string,
  capturedAt: string,
): RawBenchmarkRecord[] {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const hardwareName = text(heading?.[1] ?? '');
  const pageText = text(html);
  const scores = pageText.match(
    /Average CPU Mark(?: rating)?\s+Multithread Rating\s+([\d,]+)\s+Single Thread Rating\s+([\d,]+)(?:\s+%)?\s+Samples:\s+([\d,]+)/i,
  );
  if (!hardwareName || !scores) return [];

  const cpuMark = numeric(scores[1]);
  const singleThread = numeric(scores[2]);
  const sampleCount = numeric(scores[3]);
  if (cpuMark == null || singleThread == null || sampleCount == null) return [];

  const rawPayload = {
    detailHardwareName: hardwareName,
    cpuMark,
    singleThread,
    sampleCount,
  };
  return [
    {
      source: 'passmark',
      benchmark: 'passmark-cpu-mark',
      sourceUrl,
      capturedAt,
      hardwareName,
      score: cpuMark,
      sampleCount,
      unit: 'points',
      rawPayload,
    },
    {
      source: 'passmark',
      benchmark: 'passmark-single-thread',
      sourceUrl,
      capturedAt,
      hardwareName,
      score: singleThread,
      sampleCount,
      unit: 'points',
      rawPayload,
    },
  ];
}

export function parsePassMarkGpuDetail(
  html: string,
  sourceUrl: string,
  capturedAt: string,
): RawBenchmarkRecord[] {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const hardwareName = text(heading?.[1] ?? '').replace(/\s+Benchmark.*$/i, '');
  const pageText = text(html);
  const scores = pageText.match(
    /Average G3D Mark\s+([\d,]+).*?Average G2D Mark:\s*[\d,]+.*?Samples:\s*([\d,]+)/i,
  );
  if (!hardwareName || !scores) return [];

  const score = numeric(scores[1]);
  const sampleCount = numeric(scores[2]);
  if (score == null || sampleCount == null) return [];
  return [
    {
      source: 'passmark',
      benchmark: 'passmark-g3d-mark',
      sourceUrl,
      capturedAt,
      hardwareName,
      score,
      sampleCount,
      unit: 'points',
      rawPayload: {
        detailHardwareName: hardwareName,
        score,
        sampleCount,
      },
    },
  ];
}
