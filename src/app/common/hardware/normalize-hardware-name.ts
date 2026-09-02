export function normalizeHardwareName(value: string): string {
  return value
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\((?:r|tm|c)\)/g, '')
    .replace(/\b(?:processor|cpu|gpu|graphics card|series|edition)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyHardwareName(value: string): string {
  return normalizeHardwareName(value).replaceAll(' ', '-');
}
