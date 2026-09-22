/**
 * NotebookCheck list rows append form-factor hints and shorten VRAM
 * (`8G` / `16G`). Catalog names use bare desktop labels and `8 GB`.
 */
export function normalizeNotebookcheckGpuName(name: string): string {
  return name
    .replace(/\s*\((?:Desktop|Laptop|Mobile|Notebook)\)\s*/gi, ' ')
    .replace(/\b(\d+)\s*G\b/gi, '$1 GB')
    .replace(/\s+/g, ' ')
    .trim();
}
