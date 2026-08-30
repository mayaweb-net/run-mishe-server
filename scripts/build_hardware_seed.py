"""Generate the TypeScript hardware seed data from the open datasets.

This script is a one-off generator: it reads the raw open datasets, picks the
catalogue we actually want to ship, and emits typed TypeScript files. The raw
CSV/JSON inputs are NOT part of the repository - only the generated .ts files
are committed.

Inputs live outside the repository. Download them first:
  <datasets>/gpuark-gpu-specs.csv   GPU Ark specs incl. gpi_value   (CC BY 4.0)
      https://gpuark.com/datasets/gpuark-gpu-specs.csv
  <datasets>/gpudb.csv              optional TechPowerUp-style dump, supplies
                                    the TMU/ROP counts GPU Ark does not carry
  <buildcores>/open-db/GPU/*.json   retail boards -> popularity signal (ODC-By)
  <buildcores>/open-db/CPU/*.json   CPU specifications                (ODC-By)

Outputs (the only artefacts that are committed):
  src/app/db/prisma/seed/hardware/gpu-data.ts
  src/app/db/prisma/seed/hardware/cpu-data.ts

Usage:
  python scripts/build_hardware_seed.py \
      --buildcores ../buildcores-open-db --datasets /tmp/run-mishe-hw
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
import tempfile
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
HARDWARE = REPO / "src" / "app" / "db" / "prisma" / "seed" / "hardware"

TARGET = 250

GPU_ARK_URL = "https://gpuark.com/datasets/"
BUILDCORES_URL = "https://github.com/buildcores/buildcores-open-db"

# ---------------------------------------------------------------- helpers


TRADEMARK_RE = re.compile(r"[\u00ae\u2122\u00a9]")


def normalize(value: str) -> str:
    """Must stay in lockstep with normalizeHardwareName() in shared.ts.

    If the two drift apart the generator can emit rows that look distinct here
    but collide on the database's unique index.
    """
    # Drop the trademark glyphs before decomposition: NFKD would otherwise
    # expand U+2122 into a literal "TM" that survives into the key.
    value = TRADEMARK_RE.sub("", value or "")
    value = unicodedata.normalize("NFKD", value.lower())
    value = re.sub(r"\((?:r|tm|c)\)", "", value)
    value = re.sub(
        r"\b(?:processor|cpu|gpu|graphics card|series|edition)\b", "", value
    )
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def slugify(value: str) -> str:
    return normalize(value).replace(" ", "-")


def num(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = float(text)
    except ValueError:
        return None
    return parsed


def integer(value: Any) -> int | None:
    parsed = num(value)
    return None if parsed is None else round(parsed)


def positive_int(value: Any) -> int | None:
    parsed = integer(value)
    return parsed if parsed and parsed > 0 else None


def ts_value(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, list):
        return "[" + ", ".join(ts_value(v) for v in value) + "]"
    escaped = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"


def ts_object(fields: list[tuple[str, Any]], indent: str = "  ") -> str:
    inner = "\n".join(f"{indent}  {k}: {ts_value(v)}," for k, v in fields)
    return f"{indent}{{\n{inner}\n{indent}}},"


# ---------------------------------------------------------------- GPU

GPU_EXCLUDE_RE = re.compile(
    # datacenter and workstation silicon: never used for gaming
    r"(Quadro|Tesla|Grid |CMP |Instinct|RTX PRO|FirePro|FireGL|Radeon Pro |"
    r"Arc Pro|Workstation|Server |Shared|"
    r"\bA100\b|\bH100\b|\bH200\b|\bB200\b|\bL40\b|"
    # entry-level display adapters that cannot run modern games at all
    r"\bMX\d{3}\b|Low Power|"
    # cut-down OEM rebadges that were never sold at retail under this name
    r"Fake Card|\bOEM\b|9Gbps|\b\d{3,4}SP\b|\bRX \d{3}D[X]?\b|"
    r"\b(?:RX|GTX)\s?\d{3,4}X\b|\bSE\b|\bGME\b|\bLE\b|\b\d{3}G\b|"
    # prototypes that never reached buyers
    r"Engineering Sample|"
    # dual-GPU cards: a single-GPU estimate does not describe them
    r"\bX2\b|\d{3}X2\b|TITAN Z|GTX 690|GTX 590|HD \d{4} X2|"
    r"PhysX Edition|Mac Edition|Eco Edition)",
    re.I,
)

# Laptop silicon is kept - plenty of players game on one - but flagged so the
# picker never confuses it with the desktop card of the same model number.
GPU_LAPTOP_RE = re.compile(
    r"(Mobile|Max-Q|Laptop|Notebook|"
    r"\b(?:GTX|RTX|RX|R9|R7|[AB])\s?\d{3,4}\s?(?:M|MX|A|S)\b|"
    r"\b(?:R9|R7|R5|RX)\s+M\d{3}[A-Z]*\b)",
    re.I,
)

GPU_KEEP_RE = re.compile(r"(GeForce (GTX|RTX)|Radeon (RX|R9|VII)|Arc [AB]\d)", re.I)

# Trailing markers that describe a board revision rather than a distinct
# product. Stripped so every family collapses onto its reference card.
GPU_VARIANT_SUFFIX_RE = re.compile(
    r"\s+(?:Founders Edition|Limited Edition|Cyberpunk 2077 Edition|"
    r"50th Anniversary|Anniversary|Rev\.?\s*\d+|LHR|"
    r"(?:AD|GA|TU|GP|GK|GM|GB|GR)\d{3}[A-Z]?|Navi\s?\d+|"
    r"GDDR6X?|GDDR5X?|Core \d+|Refresh|\bD\b)$",
    re.I,
)

GPU_SIZE_SUFFIX_RE = re.compile(r"\s+\d+\s*(?:GB|MB)$", re.I)

# Announced-but-never-shipped or catalogue-artefact entries in the upstream
# dataset. Keeping them would put phantom hardware in the picker.
GPU_PHANTOMS = {
    "amd radeon rx 7990 xtx",
    "amd radeon rx 7950 xtx",
    "amd radeon rx 7950 xt",
    "amd radeon r9 fury x2",
    "amd radeon r9 285x",
    "amd radeon r9 a375",
    "intel arc b770",
    "nvidia geforce rtx 4090 48 gb",
    "nvidia geforce rtx 4090 ti",
    "nvidia geforce rtx 4080 ti",
    "nvidia geforce rtx 4010",
    "nvidia geforce rtx 5090 ti",
    "nvidia geforce rtx 6090",
    "nvidia geforce gtx 750 gm206",
    "nvidia geforce gtx 490",
}

# Older cards still show up in the minimum requirements of long-lived games,
# so the cutoff is deliberately generous. Everything above it that has a
# performance score is a candidate; there are only ~252 such desktop parts.
GPU_MIN_YEAR = 2010


GPU_VENDOR_PREFIX_RE = re.compile(r"^(?:NVIDIA|AMD|ATI|Intel)\s+", re.I)


def gpu_canonical_name(name: str) -> str:
    """Strip the vendor prefix and any board-revision markers.

    "NVIDIA GeForce RTX 3080 Founders Edition LHR" -> "GeForce RTX 3080"
    """
    canonical = GPU_VENDOR_PREFIX_RE.sub("", (name or "").strip())
    while True:
        stripped = GPU_VARIANT_SUFFIX_RE.sub("", canonical).strip()
        if stripped == canonical:
            return canonical
        canonical = stripped


def gpu_lookup_keys(name: str) -> list[str]:
    """Exact-match keys, most specific first.

    The second key drops the memory-size suffix so that a catalogue entry like
    "GeForce RTX 5060 Ti 16 GB" still lines up with sources that only know
    "GeForce RTX 5060 Ti".
    """
    canonical = gpu_canonical_name(name)
    keys = [normalize(canonical), normalize(GPU_SIZE_SUFFIX_RE.sub("", canonical))]
    return [k for k in dict.fromkeys(keys) if k]


def parse_pcie(bus: str) -> tuple[float | None, int | None]:
    match = re.search(r"PCIe\s+(\d+(?:\.\d+)?)\s*x(\d+)", bus or "", re.I)
    if not match:
        return None, None
    return float(match.group(1)), int(match.group(2))


def vendor_of(manufacturer: str) -> str:
    key = (manufacturer or "").strip().upper()
    if key == "NVIDIA":
        return "NVIDIA"
    if key in {"AMD", "ATI"}:
        return "AMD"
    if key == "INTEL":
        return "INTEL"
    return "OTHER"


def canonical_gpu_name(name: str, vendor: str) -> str:
    prefix = {"NVIDIA": "NVIDIA", "AMD": "AMD", "INTEL": "Intel"}.get(vendor)
    if not prefix or name.lower().startswith(prefix.lower()):
        return name
    return f"{prefix} {name}"


def load_tpu_index(path: Path) -> list[dict[str, dict[str, str]]]:
    """Reference-spec rows indexed per key level, used to enrich GPU Ark rows.

    GPU Ark carries no TMU/ROP counts, so those come from the TechPowerUp-style
    dump wherever the two sources name the same card.
    """
    levels: list[dict[str, dict[str, str]]] = [{}, {}]
    if not path.exists():
        return levels
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            for level, key in enumerate(gpu_lookup_keys(row.get("name") or "")):
                levels[level].setdefault(key, row)
    return levels


def load_board_counts(buildcores: Path) -> list[Counter[str]]:
    """Retail board counts per chipset, indexed per key level."""
    levels: list[Counter[str]] = [Counter(), Counter()]
    for file in glob.glob(str(buildcores / "open-db" / "GPU" / "*.json")):
        try:
            with open(file, encoding="utf-8") as handle:
                data = json.load(handle)
        except (json.JSONDecodeError, OSError):
            continue
        chipset = (data.get("chipset") or "").strip()
        if not chipset:
            continue
        for level, key in enumerate(gpu_lookup_keys(chipset)):
            levels[level][key] += 1
    return levels


def lookup(levels: list[Any], keys: list[str], default: Any = None) -> Any:
    for level, key in enumerate(keys):
        if level < len(levels) and key in levels[level]:
            return levels[level][key]
    return default


GPU_ARK_VENDOR = {"nvd": "NVIDIA", "amd": "AMD", "int": "INTEL"}


def parse_unit(value: str) -> float | None:
    """Pull the leading number out of values like "263 W" or "624.1 GB/s"."""
    match = re.match(r"\s*(\d+(?:\.\d+)?)", value or "")
    return float(match.group(1)) if match else None


def parse_vram_gb(raw: str) -> int | None:
    """GPU Ark stores VRAM in MB on older cards and GB on newer ones.

    No gaming card has ever shipped with more than 32 GB, so anything past that
    is a megabyte figure regardless of what the release date says - and the
    release date is missing on some rows.
    """
    value = num(raw)
    if not value or value <= 0:
        return None
    if value >= 64:
        value = value / 1024
    return round(value) if value >= 1 else None


def build_gpus(buildcores: Path, datasets: Path) -> list[dict[str, Any]]:
    gpuark = datasets / "gpuark-gpu-specs.csv"
    if not gpuark.exists():
        raise SystemExit(f"Missing {gpuark} - download it from {GPU_ARK_URL}")

    with gpuark.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    tpu = load_tpu_index(datasets / "gpudb.csv")
    boards = load_board_counts(buildcores)

    candidates: list[dict[str, Any]] = []
    seen_family: dict[str, dict[str, Any]] = {}

    phantoms = {normalize(p) for p in GPU_PHANTOMS}

    for row in rows:
        raw_name = (row.get("name") or "").strip()
        vendor = GPU_ARK_VENDOR.get(row.get("vendor") or "")
        if not raw_name or not vendor:
            # Rows without a chip vendor tag are OEM/partner variants.
            continue
        if GPU_EXCLUDE_RE.search(raw_name) or not GPU_KEEP_RE.search(raw_name):
            continue
        if normalize(raw_name) in phantoms:
            continue

        score = num(row.get("gpi_value"))
        if not score or score <= 0:
            continue

        released = (row.get("card_release_date") or "").strip()
        year = int(released[:4]) if released[:4].isdigit() else 0
        if year and year < GPU_MIN_YEAR:
            continue

        vram = parse_vram_gb(row.get("ram", ""))
        if vram is None or vram < 1:
            continue

        name = canonical_gpu_name(gpu_canonical_name(raw_name), vendor)
        keys = gpu_lookup_keys(raw_name)
        # "RX 580" and "RX 580 8 GB" are the same product, but "RX 580 4 GB" is
        # not - and the VRAM difference changes the estimate, so it stays.
        family = f"{keys[-1]}|{vram}"

        entry = {
            "row": row,
            "name": name,
            "vendor": vendor,
            "family": family,
            "gpi": score,
            "boards": lookup(boards, keys, 0),
            "year": year,
            "vram": vram,
            "tpu": lookup(tpu, keys, {}),
            "form_factor": "LAPTOP" if GPU_LAPTOP_RE.search(raw_name) else "DESKTOP",
            # A row whose name survived canonicalisation untouched is the
            # reference card; prefer it over any board revision.
            "is_reference": gpu_canonical_name(raw_name)
            == GPU_VENDOR_PREFIX_RE.sub("", raw_name),
        }

        def preference(item: dict[str, Any]) -> tuple[bool, int, float]:
            # reference board first, then the plainest name, then the faster bin
            return (item["is_reference"], -len(item["name"]), item["gpi"])

        current = seen_family.get(family)
        if current is None or preference(entry) > preference(current):
            if current is not None:
                candidates.remove(current)
            seen_family[family] = entry
            candidates.append(entry)

    # Popularity first so the catalogue matches what people actually own, with
    # raw performance as the tie-breaker for cards no retailer lists.
    candidates.sort(key=lambda c: (c["boards"], c["gpi"]), reverse=True)
    selected = candidates[:TARGET]

    if len(selected) < TARGET:
        raise SystemExit(
            f"Only {len(selected)} rankable GPUs found, need {TARGET}. "
            f"Lower GPU_MIN_YEAR (currently {GPU_MIN_YEAR}) to widen the pool."
        )

    by_gpi = sorted(selected, key=lambda c: c["gpi"], reverse=True)
    performance_rank = {id(c): i + 1 for i, c in enumerate(by_gpi)}
    max_gpi = by_gpi[0]["gpi"]

    result: list[dict[str, Any]] = []
    for index, entry in enumerate(selected, start=1):
        row = entry["row"]
        extra = entry["tpu"]
        name = entry["name"]
        pcie_version, pcie_lanes = parse_pcie(row.get("bus_interface", ""))
        rt_cores = positive_int(row.get("rt_cores"))

        result.append(
            {
                "slug": slugify(name),
                "name": name,
                "vendor": entry["vendor"],
                "formFactor": entry["form_factor"],
                "popularityRank": index,
                "performanceRank": performance_rank[id(entry)],
                "family": (extra.get("generation") or "").strip() or None,
                "series": (extra.get("name") or "").strip() or None,
                "architecture": (row.get("arch_name") or "").strip() or None,
                "codename": (extra.get("gpu_name") or "").strip() or None,
                "releaseDate": (row.get("card_release_date") or "").strip() or None,
                "shadingUnits": positive_int(row.get("cores")),
                "tmus": positive_int(extra.get("texture_mapping_units")),
                "rops": positive_int(extra.get("render_output_processors")),
                "tensorCores": positive_int(row.get("tensor_cores")),
                "rayTracingCores": rt_cores,
                "baseClockMhz": positive_int(row.get("base_clock")),
                "boostClockMhz": positive_int(row.get("boost_clock")),
                "memoryClockMhz": positive_int(row.get("memory_clock")),
                "vramGb": entry["vram"],
                "memoryType": (row.get("ram_type") or "").strip() or None,
                "memoryBusBits": positive_int(row.get("bus_width")),
                "bandwidthGbps": parse_unit(row.get("ram_bandwidth", "")),
                "busInterface": (row.get("bus_interface") or "").strip() or None,
                "pcieVersion": pcie_version,
                "pcieLanes": pcie_lanes,
                "tdpWatt": integer(parse_unit(row.get("tdp", ""))),
                "recommendedPsuW": integer(parse_unit(row.get("suggested_psu", ""))),
                "supportsRayTracing": bool(rt_cores),
                "retailBoardCount": entry["boards"],
                "gpiScore": round(entry["gpi"], 2),
                "gamingIndex": round(entry["gpi"] / max_gpi * 100, 2),
                "sourceUrl": f"{GPU_ARK_URL}#{row.get('slug') or ''}" or None,
            }
        )

    # Two bins of the same card can share a name while differing in VRAM (the
    # dedup key keeps them apart on purpose). Spell the difference out so the
    # slug and display name stay unique.
    by_name: Counter[str] = Counter(item["name"] for item in result)
    for item in result:
        if by_name[item["name"]] > 1 and item["vramGb"]:
            item["name"] = f"{item['name']} {item['vramGb']} GB"
            item["slug"] = slugify(item["name"])

    slugs = [item["slug"] for item in result]
    clashes = [s for s, n in Counter(slugs).items() if n > 1]
    if clashes:
        raise SystemExit(f"Duplicate GPU slugs after disambiguation: {clashes}")

    return result


# ---------------------------------------------------------------- CPU

CPU_DESKTOP_SOCKETS = {
    "AM4",
    "AM5",
    "AM3+",
    "FM2",
    "FM2+",
    "LGA 1150",
    "LGA 1151",
    "LGA 1155",
    "LGA 1200",
    "LGA 1700",
    "LGA 1851",
}

CPU_EXCLUDE_RE = re.compile(
    # server / workstation parts, and the sub-35 W "T" OEM bins that never
    # end up in a gaming build
    r"(Xeon|Opteron|EPYC|Atom|Celeron|Pentium|Threadripper|\bPRO\b|"
    r"\b(?:i[3579]|Ryzen \d)[- ]?\d{4,5}[A-Z]*T\b|\d{3,5}T$)",
    re.I,
)

# Intel writes the i-series hyphenated ("Core i9-14900K") but the Ultra series
# with a space ("Core Ultra 9 285K"); the source mixes both up.
CPU_INTEL_MODEL_RE = re.compile(r"^Intel Core (i[3579])\s+([0-9]{3,5}[A-Z]*)\b(.*)$")


def parse_lithography(value: str) -> int | None:
    match = re.search(r"(\d+)\s*nm", value or "", re.I)
    return int(match.group(1)) if match else None


def cpu_generation(series: str, name: str) -> int | None:
    match = re.search(r"\b(?:Core i\d|Ryzen \d)\s+(\d{4,5})\b", series or "")
    if match:
        return int(match.group(1)) // 1000
    match = re.search(r"\bi\d-(\d{4,5})", name or "")
    if match:
        digits = match.group(1)
        return int(digits[:2]) if len(digits) == 5 else int(digits[0])
    match = re.search(r"\bRyzen \d+ (\d{4})", name or "")
    if match:
        return int(match.group(1)) // 1000
    return None


def clean_cpu_name(raw: str) -> str:
    """Trim packaging noise and settle on one spelling per part.

    The source mixes "Intel Core i9 14900F" and "Intel Core i9-14900KS"; both
    become the hyphenated form so search and aliasing stay predictable.
    """
    name = TRADEMARK_RE.sub("", raw or "")
    name = re.sub(r"\s+(OEM/Tray|Tray|BOX|Boxed|Retail)\b.*$", "", name, flags=re.I)
    name = re.sub(r"\s+\d+(?:\.\d+)?\s*GHz\b.*$", "", name, flags=re.I)
    name = re.sub(r"\s+\d+-Core\b.*$", "", name, flags=re.I)
    name = re.sub(r"\s+", " ", name).strip()

    match = CPU_INTEL_MODEL_RE.match(name)
    if match:
        tier, model, rest = match.groups()
        name = f"Intel Core {tier}-{model}{rest}".strip()
    name = re.sub(r"^Intel Core Ultra ([3579])-", r"Intel Core Ultra \1 ", name)
    return name


def build_cpus(buildcores: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    seen: dict[str, dict[str, Any]] = {}

    for file in sorted(glob.glob(str(buildcores / "open-db" / "CPU" / "*.json"))):
        try:
            with open(file, encoding="utf-8") as handle:
                data = json.load(handle)
        except (json.JSONDecodeError, OSError):
            continue

        meta = data.get("metadata") or {}
        raw_name = meta.get("name") or ""
        name = clean_cpu_name(raw_name)
        if not name or CPU_EXCLUDE_RE.search(name):
            continue

        socket = (data.get("socket") or "").strip()
        if socket not in CPU_DESKTOP_SOCKETS:
            continue

        vendor = vendor_of(meta.get("manufacturer", ""))
        if vendor not in {"INTEL", "AMD"}:
            continue

        cores = data.get("cores") or {}
        clocks = (data.get("clocks") or {}).get("performance") or {}
        specs = data.get("specifications") or {}
        cache = data.get("cache") or {}

        threads = positive_int(cores.get("threads"))
        total_cores = positive_int(cores.get("total"))
        if not threads or not total_cores:
            continue

        base_ghz = num(clocks.get("base"))
        boost_ghz = num(clocks.get("boost"))
        if not base_ghz:
            continue

        perf_cores = positive_int(cores.get("performance")) or total_cores
        eff_cores = integer(cores.get("efficiency")) or 0
        # BuildCores stores 0/0 for CPUs without a hybrid layout.
        if perf_cores + eff_cores != total_cores:
            perf_cores, eff_cores = total_cores, 0

        year = meta.get("releaseYear")
        year = year if isinstance(year, int) and 2005 <= year <= 2030 else None

        igpu = (specs.get("integratedGraphics") or {}).get("model") or ""
        igpu = None if igpu.strip().lower() in {"", "none"} else igpu.strip()

        memory = specs.get("memory") or {}
        norm = normalize(name)

        entry = {
            "slug": slugify(name),
            "name": name,
            "vendor": vendor,
            "family": (meta.get("series") or "").strip() or None,
            "series": (data.get("series") or "").strip() or None,
            "generation": cpu_generation(data.get("series") or "", name),
            "codename": (data.get("coreFamily") or "").strip() or None,
            "architecture": (data.get("microarchitecture") or "").strip() or None,
            "socket": socket,
            "releaseYear": year,
            "performanceCores": perf_cores,
            "efficiencyCores": eff_cores,
            "threads": threads,
            "baseClockMhz": round(base_ghz * 1000),
            "boostClockMhz": round(boost_ghz * 1000) if boost_ghz else None,
            "l2CacheMb": num(cache.get("l2")),
            "l3CacheMb": num(cache.get("l3")),
            "tdpWatt": positive_int(specs.get("tdp")),
            "processNodeNm": parse_lithography(specs.get("lithography", "")),
            "isUnlocked": bool(re.search(r"(K|KF|KS|X|XT|X3D|WX)$", name)),
            "isX3d": "X3D" in name.upper(),
            "integratedGraphics": igpu,
            "memoryTypes": [t for t in (memory.get("types") or []) if t],
            "memoryChannels": positive_int(memory.get("channels")),
            "maxMemoryGb": positive_int(memory.get("maxSupport")),
            "sourceUrl": (data.get("general_product_information") or {}).get(
                "manufacturer_url"
            )
            or None,
            # Ordering proxy only - never written to the database. Games lean
            # on a few fast cores rather than raw core count, and clock speed
            # alone would rank a 2014 part next to a modern one, so newer
            # architectures get a compounding IPC allowance.
            "_score": (boost_ghz or base_ghz)
            * min(total_cores, 8)
            * 1.06 ** max(0, (year or 2014) - 2014),
        }

        previous = seen.get(norm)
        if previous is None:
            seen[norm] = entry
            entries.append(entry)
        elif (entry["releaseYear"] or 0) > (previous["releaseYear"] or 0):
            entries.remove(previous)
            seen[norm] = entry
            entries.append(entry)

    # Rank by the gaming proxy alone. Sorting on release year first would drop
    # still-popular parts such as the Ryzen 7 5800X3D in favour of every recent
    # low-end SKU.
    entries.sort(key=lambda e: e["_score"], reverse=True)
    selected = entries[:TARGET]
    if len(selected) < TARGET:
        raise SystemExit(f"Only {len(selected)} desktop CPUs found, need {TARGET}.")

    for entry in selected:
        entry.pop("_score", None)

    clashes = [s for s, n in Counter(e["slug"] for e in selected).items() if n > 1]
    if clashes:
        raise SystemExit(f"Duplicate CPU slugs: {clashes}")

    return selected


# ---------------------------------------------------------------- emit

GPU_HEADER = f"""/**
 * Curated catalogue of the {TARGET} most widely available desktop gaming GPUs.
 *
 * Generated from open datasets; do not edit by hand - regenerate instead.
 *   specs + popularity : TechPowerUp reference specs, retail board counts from
 *                        BuildCores Open DB (ODC-By 1.0) {BUILDCORES_URL}
 *   performance        : GPU Ark `gpi_value` (CC BY 4.0) {GPU_ARK_URL}
 *
 * `gamingIndex` is the GPI rescaled so the fastest card in this catalogue is
 * 100. It is stored alongside the raw `gpiScore`, which is also written to
 * `GpuBenchmarkScore` so the index stays reproducible from evidence.
 */

import type {{ GpuSeed }} from './types';

export const GPU_SEED: readonly GpuSeed[] = [
"""

CPU_HEADER = f"""/**
 * Curated catalogue of {TARGET} desktop gaming CPUs.
 *
 * Generated from the BuildCores Open DB (ODC-By 1.0) {BUILDCORES_URL}
 * Do not edit by hand - regenerate instead.
 *
 * NOTE: this source carries no benchmark scores, so `gamingIndex` is
 * deliberately left unset on every CPU. It stays null until a licensed CPU
 * benchmark source (PassMark / Geekbench) is imported and the index job runs.
 * See document/data-sources.md.
 */

import type {{ CpuSeed }} from './types';

export const CPU_SEED: readonly CpuSeed[] = [
"""

GPU_FIELDS = [
    "slug",
    "name",
    "vendor",
    "formFactor",
    "popularityRank",
    "performanceRank",
    "family",
    "series",
    "architecture",
    "codename",
    "releaseDate",
    "shadingUnits",
    "tmus",
    "rops",
    "tensorCores",
    "rayTracingCores",
    "baseClockMhz",
    "boostClockMhz",
    "memoryClockMhz",
    "vramGb",
    "memoryType",
    "memoryBusBits",
    "bandwidthGbps",
    "busInterface",
    "pcieVersion",
    "pcieLanes",
    "tdpWatt",
    "recommendedPsuW",
    "supportsRayTracing",
    "retailBoardCount",
    "gpiScore",
    "gamingIndex",
    "sourceUrl",
]

CPU_FIELDS = [
    "slug",
    "name",
    "vendor",
    "family",
    "series",
    "generation",
    "codename",
    "architecture",
    "socket",
    "releaseYear",
    "performanceCores",
    "efficiencyCores",
    "threads",
    "baseClockMhz",
    "boostClockMhz",
    "l2CacheMb",
    "l3CacheMb",
    "tdpWatt",
    "processNodeNm",
    "isUnlocked",
    "isX3d",
    "integratedGraphics",
    "memoryTypes",
    "memoryChannels",
    "maxMemoryGb",
    "sourceUrl",
]


def emit(path: Path, header: str, rows: list[dict[str, Any]], fields: list[str]) -> None:
    body = "\n".join(
        ts_object([(f, row.get(f)) for f in fields]) for row in rows
    )
    path.write_text(f"{header}{body}\n];\n", encoding="utf-8")
    print(f"wrote {len(rows):>3} entries -> {path.relative_to(REPO)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--buildcores",
        default=os.environ.get("BUILDCORES_DIR", "../buildcores-open-db"),
        help="path to a checkout of buildcores/buildcores-open-db",
    )
    parser.add_argument(
        "--datasets",
        default=os.environ.get(
            "HARDWARE_DATASETS", str(Path(tempfile.gettempdir()) / "run-mishe-hw")
        ),
        help="directory holding the downloaded CSV datasets",
    )
    args = parser.parse_args()

    buildcores = (REPO / args.buildcores).resolve()
    if not (buildcores / "open-db").is_dir():
        raise SystemExit(f"BuildCores checkout not found at {buildcores}")

    datasets = Path(args.datasets).expanduser().resolve()

    gpus = build_gpus(buildcores, datasets)
    cpus = build_cpus(buildcores)

    emit(HARDWARE / "gpu-data.ts", GPU_HEADER, gpus, GPU_FIELDS)
    emit(HARDWARE / "cpu-data.ts", CPU_HEADER, cpus, CPU_FIELDS)

    print(f"\nGPU vendors : {Counter(g['vendor'] for g in gpus).most_common()}")
    print(f"CPU vendors : {Counter(c['vendor'] for c in cpus).most_common()}")
    print(f"GPU w/ index: {sum(g['gamingIndex'] is not None for g in gpus)}")
    print(f"GPU w/ vram : {sum(g['vramGb'] is not None for g in gpus)}")
    print(f"CPU w/ boost: {sum(c['boostClockMhz'] is not None for c in cpus)}")


if __name__ == "__main__":
    main()
