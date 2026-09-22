import * as cheerio from 'cheerio';
import type { QualityPreset, ScreenResolution } from '@/app/db/generated/prisma/client';
import { NBC_DEFAULT_CONFIDENCE } from './settings';
import type { RawFpsSampleRecord } from '../types';

const MED_VAL_RE = /^bl_med_val_(\d+)_(\d+)$/;
const SAMPLE_COUNT_RE = /^n(\d+)$/i;

export interface ParsedNbcGameOption {
  nbcGameId: number;
  label: string;
}

export function parseNbcGameSelect(html: string): ParsedNbcGameOption[] {
  const $ = cheerio.load(html);
  const options: ParsedNbcGameOption[] = [];
  $('#bl_gameselect option').each((_, el) => {
    const value = $(el).attr('value');
    const label = $(el).text().trim();
    if (!value || !/^\d+$/.test(value) || !label) return;
    options.push({ nbcGameId: Number(value), label });
  });
  return options;
}

function classifyHeader(
  text: string,
): { resolution: ScreenResolution; preset: QualityPreset } | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  if (/\bdlss\b|\bfsr\s*on\b|\bxess\b|\brt\b|ray\s*trac/.test(normalized)) {
    // Still allow "FSR off" native columns.
    if (!/fsr\s*off/.test(normalized)) return null;
  }

  let resolution: ScreenResolution | null = null;
  if (/3840|2160|4\s*k|uhd/.test(normalized)) resolution = 'R2160P';
  else if (/2560|1440|qhd|wqhd/.test(normalized)) resolution = 'R1440P';
  else if (/1920|1080|fhd|full\s*hd/.test(normalized)) resolution = 'R1080P';

  let preset: QualityPreset | null = null;
  if (/\bultra\b/.test(normalized)) preset = 'ULTRA';
  else if (/\bhigh\b/.test(normalized)) preset = 'HIGH';
  else if (/\bmed(\.|ium)?\b/.test(normalized)) preset = 'MEDIUM';
  else if (/\blow\b/.test(normalized)) preset = 'LOW';

  if (!resolution && preset === 'ULTRA' && /qhd|1440/.test(normalized)) {
    resolution = 'R1440P';
  }
  if (!resolution && preset === 'ULTRA' && /4\s*k|2160/.test(normalized)) {
    resolution = 'R2160P';
  }
  if (
    !resolution &&
    preset &&
    (preset === 'LOW' || preset === 'MEDIUM' || preset === 'HIGH')
  ) {
    resolution = 'R1080P';
  }
  if (
    !resolution &&
    preset === 'ULTRA' &&
    !/1440|2160|4\s*k|qhd/.test(normalized)
  ) {
    resolution = 'R1080P';
  }

  if (!resolution || !preset) return null;
  return { resolution, preset };
}

function isTargetSetting(
  resolution: ScreenResolution,
  preset: QualityPreset,
): boolean {
  if (resolution === 'R1080P') {
    return (
      preset === 'LOW' ||
      preset === 'MEDIUM' ||
      preset === 'HIGH' ||
      preset === 'ULTRA'
    );
  }
  return (
    (resolution === 'R1440P' || resolution === 'R2160P') && preset === 'ULTRA'
  );
}

export interface ParseListOptions {
  gameSlug: string;
  nbcGameId: number;
  sourceUrl: string;
  capturedAt?: string;
  allowedGameIds?: ReadonlySet<number>;
}

function findGpuListTable(
  $: cheerio.CheerioAPI,
): cheerio.Cheerio<cheerio.Element> {
  const tables = $('table.sortable').toArray();
  for (const table of tables) {
    const $table = $(table);
    if ($table.find('td.specs.fullname, span[class*="bl_med_val_"]').length > 0) {
      return $table;
    }
  }
  return $('table.sortable').first();
}

function buildOrderedSettings(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<cheerio.Element>,
): Array<{ resolution: ScreenResolution; preset: QualityPreset }> {
  const ordered: Array<{
    resolution: ScreenResolution;
    preset: QualityPreset;
  }> = [];

  table.find('tr').each((_, row) => {
    if (ordered.length > 0) return false;
    const $row = $(row);
    if ($row.hasClass('header')) return;
    if ($row.find('td.specs.fullname').length > 0) return;

    const classified: Array<{
      resolution: ScreenResolution;
      preset: QualityPreset;
    }> = [];
    $row.children('td, th').each((__, cell) => {
      const setting = classifyHeader($(cell).text());
      if (setting && isTargetSetting(setting.resolution, setting.preset)) {
        classified.push(setting);
      }
    });
    if (classified.length >= 4) {
      ordered.push(...classified);
    }
  });

  if (ordered.length === 0) {
    return [
      { resolution: 'R1080P', preset: 'LOW' },
      { resolution: 'R1080P', preset: 'MEDIUM' },
      { resolution: 'R1080P', preset: 'HIGH' },
      { resolution: 'R1080P', preset: 'ULTRA' },
      { resolution: 'R1440P', preset: 'ULTRA' },
      { resolution: 'R2160P', preset: 'ULTRA' },
    ];
  }
  return ordered;
}

export function parseNbcDesktopList(
  html: string,
  options: ParseListOptions,
): RawFpsSampleRecord[] {
  const $ = cheerio.load(html);
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const records: RawFpsSampleRecord[] = [];
  const allowed = options.allowedGameIds ?? new Set([options.nbcGameId]);

  const table = findGpuListTable($);
  if (table.length === 0) return records;

  const orderedSettings = buildOrderedSettings($, table);

  table.find('tr').each((_, row) => {
    const $row = $(row);
    const gpuName = $row
      .find('td.specs.fullname')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (!gpuName) return;

    const fpsCells: Array<{
      nbcGameId: number;
      avgFps: number;
      sampleCount?: number;
    }> = [];

    $row.children('td').each((__, cell) => {
      const $span = $(cell).find('span[class*="bl_med_val_"]').first();
      if ($span.length === 0) return;

      const className = $span.attr('class') ?? '';
      const match = className
        .split(/\s+/)
        .map((token) => token.match(MED_VAL_RE))
        .find(Boolean);
      if (!match) return;

      const nbcGameId = Number(match[1]);
      if (!allowed.has(nbcGameId)) return;

      const raw = $span.text().trim().replace(',', '.');
      const avgFps = Number.parseFloat(raw);
      if (!Number.isFinite(avgFps) || avgFps <= 0) return;

      let sampleCount: number | undefined;
      const sampleMatch = $span.next('sup').text().trim().match(SAMPLE_COUNT_RE);
      if (sampleMatch) sampleCount = Number(sampleMatch[1]);

      fpsCells.push({ nbcGameId, avgFps, sampleCount });
    });

    const count = Math.min(fpsCells.length, orderedSettings.length);
    for (let index = 0; index < count; index += 1) {
      const cell = fpsCells[index]!;
      const setting = orderedSettings[index]!;
      records.push({
        source: 'notebookcheck',
        sourceUrl: options.sourceUrl,
        gameSlug: options.gameSlug,
        nbcGameId: cell.nbcGameId,
        gpuName,
        resolution: setting.resolution,
        preset: setting.preset,
        avgFps: cell.avgFps,
        sampleCount: cell.sampleCount,
        confidence: NBC_DEFAULT_CONFIDENCE,
        capturedAt,
      });
    }
  });

  return records;
}

export function matchNbcLabelScore(
  label: string,
  candidateName: string,
): number {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .replace(/[™®©]/g, '')
      .replace(/['’]/g, "'")
      .replace(/\bgrand theft auto\b/g, 'gta')
      .replace(/\bred dead redemption\b/g, 'rdr')
      .replace(/\bcall of duty\b/g, 'cod')
      .replace(/\bfinal fantasy\b/g, 'ff')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const left = norm(label);
  const right = norm(candidateName);
  if (!left || !right) return 0;
  if (left === right) return 1;
  // Year-prefixed NBC labels: "2015 GTA V"
  const leftNoYear = left.replace(/^\d{4}\s+/, '');
  if (leftNoYear === right) return 0.98;

  const leftTokens = leftNoYear.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);
  if (rightTokens.length === 0) return 0;

  // Version / edition tokens in the candidate must appear in the label.
  const versionLike = /^(iv|v|vi|vii|viii|ix|x|\d+)$/;
  for (const token of rightTokens) {
    if (versionLike.test(token) && !leftTokens.includes(token)) return 0;
  }

  const leftSet = new Set(leftTokens);
  const hit = rightTokens.filter((token) => leftSet.has(token)).length;
  const coverage = hit / rightTokens.length;
  if (coverage < 0.8) return 0;
  // Prefer shorter labels (avoid "GTA IV - Grand Theft Auto" beating "GTA V").
  const brevity = Math.min(1, rightTokens.length / Math.max(leftTokens.length, 1));
  return coverage * 0.85 + brevity * 0.15;
}

export function matchNbcLabelToName(
  label: string,
  candidateName: string,
): boolean {
  return matchNbcLabelScore(label, candidateName) >= 0.8;
}

export function bestNbcLabelMatch(
  options: readonly ParsedNbcGameOption[],
  candidateName: string,
): ParsedNbcGameOption | null {
  let best: ParsedNbcGameOption | null = null;
  let bestScore = 0;
  for (const option of options) {
    const score = matchNbcLabelScore(option.label, candidateName);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return bestScore >= 0.8 ? best : null;
}
