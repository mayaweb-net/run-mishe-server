# FPS sample pipeline (NotebookCheck)

Independent of Nest runtime — same spirit as `scripts/benchmarks/`:

```text
Playwright fetch → HTML cache → Cheerio parse → JSONL → import:fps → FpsSample
```

## Target matrix

- Games: curated allowlist titles that have a NotebookCheck game id
- GPUs: top 100 desktop GPUs by `gamingIndex` (filter at import time)
- CPU: single best desktop CPU by `gamingIndex` (attached at import)
- Settings: 1080p Low/Med/High/Ultra, 1440p Ultra, 4K Ultra
- `upscaler=NONE`, no RT / frame-gen

## Crawl

Requires Playwright. Prefer bundled Chromium; if download fails, system Chrome/Edge is used automatically.

```bash
pnpm crawler:fps -- --limit-games 3 --dry-run
pnpm crawler:fps -- --limit-games 5
pnpm crawler:fps
pnpm crawler:fps -- --force --channel=chrome
```

Options:

- `--limit-games N` — only first N mapped titles
- `--dry-run` — parse and report, do not write JSONL
- `--force` — ignore HTML cache
- `--delay MS` — pause between page fetches (default 1500)
- `--batch-size N` — games per NBC URL (default 1)
- `--channel chrome|msedge|chromium` — force a browser channel

Output (gitignored):

```text
data/fps/cache/*.json
data/fps/notebookcheck/YYYY-MM-DD.jsonl
data/fps/missed/notebookcheck/YYYY-MM-DD.jsonl
```

## Import

```bash
pnpm index:hardware   # ensure gamingIndex exists
pnpm import:fps -- --dry-run
pnpm import:fps
pnpm import:fps -- --top-gpus 100 data/fps/notebookcheck/2026-09-22.jsonl
```

Creates an `ImportBatch` (`kind=fps`, `source=notebookcheck`) and upserts
`FpsSample` rows by `dedupeKey`.

## Notes

- NotebookCheck ToS / attribution: polite delays, aggressive caching, keep `sourceUrl`.
- Aggregate list medians have no per-row CPU → importer uses the top desktop CPU sentinel (`confidence` 0.75).
- Titles without an NBC id (Valorant, Fortnite, …) stay in the missed file.
