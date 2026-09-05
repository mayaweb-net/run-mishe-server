export function normalizeHardwareName(value: string): string {
  let normalized = value
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

  // PassMark commonly appends topology to otherwise exact retail names.
  // Restrict this to named Intel/AMD families; core count is meaningful in
  // product names such as "Apple M5 10 Core".
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

export function slugifyHardwareName(value: string): string {
  return normalizeHardwareName(value).replaceAll(' ', '-');
}
