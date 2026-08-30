export type MatchKind = 'CPU' | 'GPU';

export interface RequirementAlias {
  kind: MatchKind;
  alias: string;
  cpuId: string | null;
  gpuId: string | null;
  weight: number;
}

export interface RequirementHardwareMatch {
  kind: MatchKind;
  matchedText: string;
  alias: string;
  cpuId: string | null;
  gpuId: string | null;
  matchScore: number;
  needsReview: boolean;
}

interface SourceToken {
  value: string;
  start: number;
  end: number;
}

const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const NOISE_TOKENS = new Set([
  'c',
  'card',
  'core',
  'cpu',
  'edition',
  'gpu',
  'graphics',
  'processor',
  'r',
  'series',
  'tm',
]);
const MODEL_SUFFIXES = new Set([
  'gre',
  'gt',
  'laptop',
  'm',
  'maxq',
  'mobile',
  'super',
  'ti',
  'xt',
  'xtx',
]);

function normalizeToken(value: string): string {
  return value
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function tokenParts(value: string): string[] {
  const numberThenLetters = /^(\d+)([a-z]+)$/.exec(value);
  if (numberThenLetters) {
    return [numberThenLetters[1], numberThenLetters[2]];
  }

  const compactGpuModel = /^(gtx|rtx|rx|hd)(\d+)$/.exec(value);
  if (compactGpuModel) {
    return [compactGpuModel[1], compactGpuModel[2]];
  }

  return [value];
}

function tokenizeSource(text: string): SourceToken[] {
  const tokens: SourceToken[] = [];

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    for (const value of tokenParts(normalizeToken(match[0]))) {
      if (!value || NOISE_TOKENS.has(value)) continue;
      tokens.push({ value, start, end });
    }
  }

  return tokens;
}

function aliasTokens(alias: string): string[] {
  return alias
    .split(/\s+/)
    .flatMap((token) => tokenParts(normalizeToken(token)))
    .filter((token) => token && !NOISE_TOKENS.has(token));
}

function hasUnmatchedModelSuffix(
  source: SourceToken[],
  start: number,
  length: number,
): boolean {
  const next = source[start + length]?.value;
  return Boolean(next && MODEL_SUFFIXES.has(next));
}

/**
 * Finds exact normalized aliases in free-form Steam requirement text.
 *
 * Candidates beginning at the same token are ordered longest-first, avoiding
 * prefix mistakes such as resolving "RTX 4070 Ti" as "RTX 4070".
 */
export function matchRequirementHardware(
  text: string | null,
  kind: MatchKind,
  aliases: readonly RequirementAlias[],
): RequirementHardwareMatch[] {
  if (!text) return [];

  const source = tokenizeSource(text);
  const byFirstToken = new Map<
    string,
    Array<{ candidate: RequirementAlias; tokens: string[] }>
  >();

  for (const candidate of aliases) {
    if (candidate.kind !== kind) continue;
    const tokens = aliasTokens(candidate.alias);
    if (tokens.length === 0) continue;

    const bucket = byFirstToken.get(tokens[0]) ?? [];
    bucket.push({ candidate, tokens });
    byFirstToken.set(tokens[0], bucket);
  }

  for (const bucket of byFirstToken.values()) {
    bucket.sort(
      (left, right) =>
        right.tokens.length - left.tokens.length ||
        right.candidate.weight - left.candidate.weight ||
        left.candidate.alias.localeCompare(right.candidate.alias),
    );
  }

  const matches: RequirementHardwareMatch[] = [];
  let index = 0;

  while (index < source.length) {
    const candidates = byFirstToken.get(source[index].value) ?? [];
    const found = candidates.find(({ tokens }) => {
      if (
        tokens.some(
          (token, offset) => source[index + offset]?.value !== token,
        )
      ) {
        return false;
      }

      return !hasUnmatchedModelSuffix(source, index, tokens.length);
    });

    if (!found) {
      index += 1;
      continue;
    }

    const last = source[index + found.tokens.length - 1];
    matches.push({
      kind,
      matchedText: text.slice(source[index].start, last.end),
      alias: found.candidate.alias,
      cpuId: found.candidate.cpuId,
      gpuId: found.candidate.gpuId,
      matchScore: 1,
      needsReview: false,
    });
    index += found.tokens.length;
  }

  return matches.filter(
    (match, matchIndex) =>
      matches.findIndex(
        (candidate) =>
          candidate.matchedText === match.matchedText &&
          candidate.cpuId === match.cpuId &&
          candidate.gpuId === match.gpuId,
      ) === matchIndex,
  );
}
