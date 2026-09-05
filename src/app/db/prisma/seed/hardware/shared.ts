import { Vendor } from '../../../generated/prisma/client';

import type { SeedVendor } from './types';

/**
 * Matching key for a piece of hardware.
 *
 * Everything that is punctuation, casing or marketing noise is thrown away so
 * that "Intel(R) Core(TM) i5-13600K" and "intel core i5 13600k" collapse onto
 * the same string. `HardwareAlias.alias` stores names in this form.
 */
export function normalizeHardwareName(value: string): string {
  let normalized = value
    // Before NFKD: it would expand "™" into a literal "TM" that then leaks
    // into the key as if it were part of the product name.
    .replace(/[®™©]/g, '')
    .replace(/\s*@\s*\d+(?:\.\d+)?\s*ghz\b/gi, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\((?:r|tm|c)\)/g, '')
    .replace(
      /\b(?:processor|cpu|gpu|apu|graphics(?:\s+card)?|series|edition)\b/g,
      '',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bcore2\b/g, 'core 2')
    .replace(/\b(\d+)\s+gb\b/g, '$1gb')
    .replace(/\s+/g, ' ')
    .trim();

  if (/\bryzen\b|\bintel\s+core\b/.test(normalized)) {
    normalized = normalized.replace(/\s+\d+\s+core$/, '');
  }
  if (/^(?:amd|intel)\b/.test(normalized)) {
    normalized = normalized.replace(
      /\b(?:dual|triple|quad|six|eight|twelve|sixteen)\s+core\b/g,
      ' ',
    );
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

export function slugify(value: string): string {
  return normalizeHardwareName(value).replaceAll(' ', '-');
}

export function toVendor(vendor: SeedVendor): Vendor {
  return Vendor[vendor];
}

/** Strips the vendor prefix: "NVIDIA GeForce RTX 4070" -> "GeForce RTX 4070". */
export function withoutVendorPrefix(name: string): string {
  return name.replace(/^(?:NVIDIA|AMD|ATI|Intel)\s+/i, '').trim();
}

/**
 * Every spelling users and requirement strings are likely to type.
 *
 * Deliberately conservative: bare model numbers such as "3060" are ambiguous
 * across vendors and generations, so they are never emitted.
 */
export function buildAliases(name: string, extra: string[] = []): string[] {
  const candidates = [name, withoutVendorPrefix(name), ...extra];
  const aliases = candidates
    .map(normalizeHardwareName)
    .filter((alias) => alias.length > 2);
  return [...new Set(aliases)];
}

/** Guards against two seed rows fighting over the same unique column. */
export function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate ${label} in seed data: ${[...duplicates].join(', ')}`,
    );
  }
}
