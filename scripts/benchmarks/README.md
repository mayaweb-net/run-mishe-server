# Benchmark data pipeline

This pipeline runs independently from the NestJS application:

```text
catalog seed -> crawler -> cached response + JSONL -> importer
             -> ImportBatch -> ImportRecord -> canonical benchmark score
             -> pnpm index:hardware -> Cpu/Gpu.gamingIndex
```

Crawl/import never write `gamingIndex` directly. The index job derives it from
`Benchmark.weightInIndex` + `*BenchmarkScore` (see `document/estimation.md`).

## Sources

- PassMark CPU Mark: `https://www.cpubenchmark.net/cpu-list/` and
  `https://www.cpubenchmark.net/cpu-list/amd/`
- PassMark Single Thread Rating: `https://www.cpubenchmark.net/singleThread.html`
- PassMark G3D Mark: `https://www.videocardbenchmark.net/gpu_list.php`
- 3DMark Time Spy Graphics: definition only. No representative official
  per-GPU dataset is configured, so the adapter reports it as unavailable.

The PassMark adapter uses ordinary public HTTP only. It does not bypass access
controls, CAPTCHA, rate limits, or anti-bot systems. Before using collected data
in a product, review the source's current terms and licensing requirements.

CPU Mark is collected from PassMark's separate Intel and AMD bulk lists. After
bulk matching, the crawler checks missing catalog entries through the ordinary
CPU/GPU detail page lookup and accepts a result only when the returned hardware
resolves exactly to the requested catalog row. Combined or redirected variants
such as `Radeon RX 470/570`, or a desktop query resolving to a laptop model, are
left in `missed` instead of being assigned speculatively.

## Crawl

```bash
pnpm crawler:cpu
pnpm crawler:gpu

pnpm crawler:cpu --limit 10 --dry-run
pnpm crawler:gpu --source passmark --force
```

Options:

- `--limit N`: process only the first N catalog entries.
- `--source passmark|3dmark`: run one source adapter.
- `--dry-run`: fetch/parse and report without writing cache or JSONL.
- `--force`: ignore an existing response cache.
- `--concurrency N`: validate the requested concurrency ceiling. The current
  PassMark bulk adapter deliberately issues its two CPU requests serially.

Catalog input comes from the checked-in `CPU_SEED` and `GPU_SEED`; the crawler
does not invent hardware. Responses are cached by URL under
`data/benchmarks/cache/`. Catalog-matched results are written to:

```text
data/benchmarks/cpu/passmark/YYYY-MM-DD.jsonl
data/benchmarks/gpu/passmark/YYYY-MM-DD.jsonl
data/benchmarks/cpu/missed/passmark/YYYY-MM-DD.jsonl
data/benchmarks/gpu/missed/passmark/YYYY-MM-DD.jsonl
data/benchmarks/gpu/missed/3dmark/YYYY-MM-DD.jsonl
```

These files are ignored by Git. Preserve or back them up according to the
source license if replayable crawl history is required.

The `missed` files contain one row per missing hardware/benchmark pair, with
the catalog slug and name, benchmark source, check timestamp, and either
`not-found` or `source-unavailable`. They are diagnostic reports and are
automatically excluded from `import:benchmarks`. To inspect only PassMark gaps
without counting Time Spy, run `pnpm crawler:gpu --source passmark`.

## Import

Seed the catalog first, then crawl and import:

```bash
pnpm exec prisma db seed
pnpm crawler:cpu
pnpm crawler:gpu
pnpm import:benchmarks
pnpm index:hardware
```

Pass explicit snapshots when needed:

```bash
pnpm import:benchmarks data/benchmarks/cpu/passmark/2026-09-05.jsonl
pnpm import:benchmarks --dry-run data/benchmarks/gpu/passmark/2026-09-05.jsonl
```

### Hardware index

```bash
pnpm index:hardware
```

Rebuilds `Cpu.gamingIndex` / `singleThreadIndex` / `multiThreadIndex` and
`Gpu.gamingIndex` from active weighted benchmarks. GPU currently blends GPU Ark
GPI (0.7) with PassMark G3D (0.3). CPU blends PassMark single (65%) and multi (35%).

The importer:

1. validates every raw record and benchmark/unit combination;
2. stages the untouched payload in `ImportRecord`;
3. resolves an exact normalized hardware name, exact known alias, or a unique
   conservative vendor-prefix variant;
4. marks ambiguous/missing hardware as `NEEDS_REVIEW`;
5. inserts a score, updates only newer changed evidence, or skips a replay.

Invalid scores (`0`, negative, non-finite, or malformed strings) are marked
`FAILED`. The raw JSONL remains unchanged. Each run creates a new
`ImportBatch`, preserving import history while canonical unique constraints
prevent duplicate scores.
