import { getBenchmarkDefinition, isBenchmarkSlug } from './definitions';
import type {
  BenchmarkSource,
  RawBenchmarkRecord,
  ValidatedBenchmarkRecord,
} from './types';

const SOURCES = new Set<BenchmarkSource>(['passmark', '3dmark']);
const STRICT_NUMBER = /^\d+(?:\.\d+)?$/;

export function parsePositiveScore(value: unknown): number | null {
  let score: number;
  if (typeof value === 'number') {
    score = value;
  } else if (typeof value === 'string' && STRICT_NUMBER.test(value.trim())) {
    score = Number(value.trim());
  } else {
    return null;
  }

  return Number.isFinite(score) && score > 0 ? score : null;
}

export function validateRawBenchmarkRecord(value: unknown): {
  value?: ValidatedBenchmarkRecord;
  error?: string;
} {
  if (!value || typeof value !== 'object') {
    return { error: 'Record must be an object' };
  }

  const row = value as Partial<RawBenchmarkRecord>;
  if (
    typeof row.source !== 'string' ||
    !SOURCES.has(row.source as BenchmarkSource)
  ) {
    return { error: 'Unsupported source' };
  }
  if (typeof row.benchmark !== 'string' || !isBenchmarkSlug(row.benchmark)) {
    return { error: 'Unsupported benchmark' };
  }

  const definition = getBenchmarkDefinition(row.benchmark);
  if (definition.source !== row.source) {
    return { error: 'Source does not match benchmark definition' };
  }
  if (
    typeof row.sourceUrl !== 'string' ||
    !URL.canParse(row.sourceUrl) ||
    !/^https?:$/.test(new URL(row.sourceUrl).protocol) ||
    typeof row.hardwareName !== 'string' ||
    row.hardwareName.trim().length === 0
  ) {
    return { error: 'Invalid sourceUrl or hardwareName' };
  }

  const capturedAt = new Date(row.capturedAt ?? '');
  if (!Number.isFinite(capturedAt.getTime())) {
    return { error: 'Invalid capturedAt' };
  }

  const score = parsePositiveScore(row.score);
  if (score == null) return { error: 'Score must be finite and positive' };

  const unit = row.unit ?? definition.unit;
  if (unit !== definition.unit) {
    return {
      error: `Unit ${unit} is incompatible with ${definition.slug}`,
    };
  }
  if (
    row.sampleCount != null &&
    (!Number.isInteger(row.sampleCount) || row.sampleCount <= 0)
  ) {
    return { error: 'sampleCount must be a positive integer' };
  }

  return {
    value: {
      ...(row as RawBenchmarkRecord),
      source: row.source as BenchmarkSource,
      benchmark: row.benchmark,
      sourceUrl: row.sourceUrl,
      capturedAt: capturedAt.toISOString(),
      hardwareName: row.hardwareName.trim(),
      score,
      unit,
      rawPayload: row.rawPayload,
    },
  };
}
