"""Extend the hardware catalogue from unmatched Steam requirement texts.

Reads `src/app/db/prisma/seed/unmatched.csv`, extracts concrete CPU/GPU model
tokens, looks them up in the same open datasets used by `build_hardware_seed.py`,
and appends missing parts to `cpu-data.ts` / `gpu-data.ts`.

Usage:
  python scripts/extend_hardware_from_unmatched.py \\
      --buildcores ../buildcores-open-db \\
      --datasets src/app/db/prisma/seed
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

# Reuse the canonical normalizer and GPU helpers from the main generator.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_hardware_seed import (  # noqa: E402
    BUILDCORES_URL,
    GPU_ARK_URL,
    GPU_KEEP_RE,
    GPU_LAPTOP_RE,
    GPU_MIN_YEAR,
    GPU_VENDOR_PREFIX_RE,
    build_cpus,
    clean_cpu_name,
    cpu_generation,
    gpu_canonical_name,
    gpu_lookup_keys,
    integer,
    normalize,
    num,
    parse_lithography,
    parse_pcie,
    parse_vram_gb,
    positive_int,
    slugify,
    ts_object,
    ts_value,
    vendor_of,
)

REPO = Path(__file__).resolve().parent.parent
HARDWARE = REPO / "src" / "app" / "db" / "prisma" / "seed" / "hardware"
UNMATCHED = REPO / "src" / "app" / "db" / "prisma" / "seed" / "unmatched.csv"

CPU_QUERY_RES = [
    re.compile(r"\bi([3579])\s*[- ]?\s*(\d{3,5}[a-z]*)\b", re.I),
    re.compile(r"\bryzen\s*(\d)\s*(\d{4}[a-z]*)\b", re.I),
    re.compile(r"\bfx[-\s]?(\d{4})\b", re.I),
    re.compile(r"\ba(\d+)[-\s]?(\d{4}[a-z]*)\b", re.I),
    re.compile(r"\bphenom(?:\s+ii)?\s+x(\d)\s*[- ]?\s*(\d{4})\b", re.I),
    re.compile(r"\bphenom\s+x(\d)\s*[- ]?\s*(\d{4})\b", re.I),
    re.compile(r"\bpentium\s+g(\d{4})\b", re.I),
    re.compile(r"\bcore\s*2\s+duo\s+e(\d{4})\b", re.I),
    re.compile(r"\bathlon(?:\s+64)?\s*x2\s*(\d{4})\+\b", re.I),
]

GPU_QUERY_RES = [
    re.compile(
        r"\b(?:geforce\s+)?(gt|gts|gtx|rtx)\s*(\d{3,4}(?:\s*(?:ti|super|xt|xtx|gre))?)\b",
        re.I,
    ),
    re.compile(
        r"\bgeforce\s+(\d{3,4})\s+gt\b",
        re.I,
    ),
    re.compile(r"\b(?:radeon\s+)?(?:rx|r[79])\s*(\d{3,4}(?:\s*(?:xt|xtx|gre))?)\b", re.I),
    re.compile(r"(?<!intel\s)(?<!intel\sgraphics\s)\b(?:radeon\s+)?hd\s*(\d{3,4})\b", re.I),
    re.compile(r"\bgeforce\s+(\d{3,4})\b", re.I),
    re.compile(r"\b(?:amd|ati)\s+(\d{3,4})\b", re.I),
    re.compile(r"\bnvidia\s+(\d{3,4})\b", re.I),
]

AMBIGUOUS_CPU = re.compile(
    r"^(intel core i[3579]|intel i[3579]|ryzen\s*\d|core 2 duo|dual core|quad core)$",
    re.I,
)

AMBIGUOUS_GPU = re.compile(
    r"^(geforce|nvidia|radeon|integrated|directx|opengl|video card)$",
    re.I,
)

# Steam requirement CPUs that BuildCores often lacks. Specs from TechPowerUp.
MANUAL_CPU: dict[str, dict[str, Any]] = {
    "amd fx-6300": {
        "name": "AMD FX-6300",
        "vendor": "AMD",
        "family": "FX 6000",
        "series": "FX 6000",
        "generation": None,
        "codename": "Vishera",
        "architecture": "Piledriver",
        "socket": "AM3+",
        "releaseYear": 2012,
        "performanceCores": 6,
        "efficiencyCores": 0,
        "threads": 6,
        "baseClockMhz": 3500,
        "boostClockMhz": 4100,
        "l2CacheMb": 6.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 95,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/fx-6300.c724",
    },
    "amd fx-4350": {
        "name": "AMD FX-4350",
        "vendor": "AMD",
        "family": "FX 4000",
        "series": "FX 4000",
        "generation": None,
        "codename": "Vishera",
        "architecture": "Piledriver",
        "socket": "AM3+",
        "releaseYear": 2013,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 4200,
        "boostClockMhz": 4300,
        "l2CacheMb": 4.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 125,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/fx-4350.c1987",
    },
    "amd fx-4300": {
        "name": "AMD FX-4300",
        "vendor": "AMD",
        "family": "FX 4000",
        "series": "FX 4000",
        "generation": None,
        "codename": "Vishera",
        "architecture": "Piledriver",
        "socket": "AM3+",
        "releaseYear": 2012,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3800,
        "boostClockMhz": 3900,
        "l2CacheMb": 4.0,
        "l3CacheMb": 4.0,
        "tdpWatt": 95,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/fx-4300.c1986",
    },
    "amd fx-4100": {
        "name": "AMD FX-4100",
        "vendor": "AMD",
        "family": "FX 4000",
        "series": "FX 4000",
        "generation": None,
        "codename": "Zambezi",
        "architecture": "Bulldozer",
        "socket": "AM3+",
        "releaseYear": 2011,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3600,
        "boostClockMhz": 3800,
        "l2CacheMb": 4.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 95,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/fx-4100.c723",
    },
    "amd fx-6100": {
        "name": "AMD FX-6100",
        "vendor": "AMD",
        "family": "FX 6000",
        "series": "FX 6000",
        "generation": None,
        "codename": "Zambezi",
        "architecture": "Bulldozer",
        "socket": "AM3+",
        "releaseYear": 2011,
        "performanceCores": 6,
        "efficiencyCores": 0,
        "threads": 6,
        "baseClockMhz": 3300,
        "boostClockMhz": 3600,
        "l2CacheMb": 6.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 95,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/fx-6100.c722",
    },
    "amd fx-6350": {
        "name": "AMD FX-6350",
        "vendor": "AMD",
        "family": "FX 6000",
        "series": "FX 6000",
        "generation": None,
        "codename": "Vishera",
        "architecture": "Piledriver",
        "socket": "AM3+",
        "releaseYear": 2013,
        "performanceCores": 6,
        "efficiencyCores": 0,
        "threads": 6,
        "baseClockMhz": 3900,
        "boostClockMhz": 4100,
        "l2CacheMb": 6.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 125,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/fx-6350.c1988",
    },
    "amd fx-8120": {
        "name": "AMD FX-8120",
        "vendor": "AMD",
        "family": "FX 8000",
        "series": "FX 8000",
        "generation": None,
        "codename": "Zambezi",
        "architecture": "Bulldozer",
        "socket": "AM3+",
        "releaseYear": 2011,
        "performanceCores": 8,
        "efficiencyCores": 0,
        "threads": 8,
        "baseClockMhz": 3100,
        "boostClockMhz": 4000,
        "l2CacheMb": 8.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 125,
        "processNodeNm": 32,
        "isUnlocked": True,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/fx-8120.c721",
    },
    "amd fx-8300": {
        "name": "AMD FX-8300",
        "vendor": "AMD",
        "family": "FX 8000",
        "series": "FX 8000",
        "generation": None,
        "codename": "Vishera",
        "architecture": "Piledriver",
        "socket": "AM3+",
        "releaseYear": 2012,
        "performanceCores": 8,
        "efficiencyCores": 0,
        "threads": 8,
        "baseClockMhz": 3300,
        "boostClockMhz": 4000,
        "l2CacheMb": 8.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 95,
        "processNodeNm": 32,
        "isUnlocked": True,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/fx-8300.c1989",
    },
    "amd fx-8320": {
        "name": "AMD FX-8320",
        "vendor": "AMD",
        "family": "FX 8000",
        "series": "FX 8000",
        "generation": None,
        "codename": "Vishera",
        "architecture": "Piledriver",
        "socket": "AM3+",
        "releaseYear": 2012,
        "performanceCores": 8,
        "efficiencyCores": 0,
        "threads": 8,
        "baseClockMhz": 3500,
        "boostClockMhz": 4000,
        "l2CacheMb": 8.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 125,
        "processNodeNm": 32,
        "isUnlocked": True,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/fx-8320.c1990",
    },
    "intel core i5-4430": {
        "name": "Intel Core i5-4430",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 4000",
        "generation": 4,
        "codename": "Haswell",
        "architecture": "Haswell",
        "socket": "LGA 1150",
        "releaseYear": 2013,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3000,
        "boostClockMhz": 3200,
        "l2CacheMb": 1.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 84,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 4600",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-4430.c1530",
    },
    "intel core i5-3470": {
        "name": "Intel Core i5-3470",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 3000",
        "generation": 3,
        "codename": "Ivy Bridge",
        "architecture": "Ivy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2012,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3200,
        "boostClockMhz": 3600,
        "l2CacheMb": 1.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 77,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 2500",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-3470.c1520",
    },
    "intel core i3-4330": {
        "name": "Intel Core i3-4330",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3 4000",
        "generation": 4,
        "codename": "Haswell",
        "architecture": "Haswell",
        "socket": "LGA 1150",
        "releaseYear": 2013,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3500,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 4.0,
        "tdpWatt": 54,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 4600",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-4330.c1528",
    },
    "intel core i3-3240": {
        "name": "Intel Core i3-3240",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3 3000",
        "generation": 3,
        "codename": "Ivy Bridge",
        "architecture": "Ivy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2012,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3400,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 55,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 2500",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-3240.c1514",
    },
    "intel core i3-3210": {
        "name": "Intel Core i3-3210",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3 3000",
        "generation": 3,
        "codename": "Ivy Bridge",
        "architecture": "Ivy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2012,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3100,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 55,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 2500",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-3210.c1512",
    },
    "intel core i5-2300": {
        "name": "Intel Core i5-2300",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 2000",
        "generation": 2,
        "codename": "Sandy Bridge",
        "architecture": "Sandy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2011,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 2800,
        "boostClockMhz": 3100,
        "l2CacheMb": 1.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 95,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 2000",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-2300.c1494",
    },
    "intel core i5-2400": {
        "name": "Intel Core i5-2400",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 2000",
        "generation": 2,
        "codename": "Sandy Bridge",
        "architecture": "Sandy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2011,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3100,
        "boostClockMhz": 3400,
        "l2CacheMb": 1.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 95,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 2000",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-2400.c1496",
    },
    "intel core i5-2500k": {
        "name": "Intel Core i5-2500K",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 2000",
        "generation": 2,
        "codename": "Sandy Bridge",
        "architecture": "Sandy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2011,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3300,
        "boostClockMhz": 3700,
        "l2CacheMb": 1.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 95,
        "processNodeNm": 32,
        "isUnlocked": True,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 3000",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-2500k.c1498",
    },
    "intel core i5-3330": {
        "name": "Intel Core i5-3330",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 3000",
        "generation": 3,
        "codename": "Ivy Bridge",
        "architecture": "Ivy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2012,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3000,
        "boostClockMhz": 3200,
        "l2CacheMb": 1.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 77,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 2500",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-3330.c1518",
    },
    "intel core i5-4460": {
        "name": "Intel Core i5-4460",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 4000",
        "generation": 4,
        "codename": "Haswell",
        "architecture": "Haswell",
        "socket": "LGA 1150",
        "releaseYear": 2014,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3200,
        "boostClockMhz": 3400,
        "l2CacheMb": 1.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 84,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 4600",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-4460.c1532",
    },
    "intel core i5-750": {
        "name": "Intel Core i5-750",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5",
        "generation": 1,
        "codename": "Lynnfield",
        "architecture": "Nehalem",
        "socket": "LGA 1156",
        "releaseYear": 2009,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 2660,
        "boostClockMhz": 3200,
        "l2CacheMb": 1.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 95,
        "processNodeNm": 45,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 16,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-750.c1470",
    },
    "intel core i7-930": {
        "name": "Intel Core i7-930",
        "vendor": "INTEL",
        "family": "Core i7",
        "series": "Core i7",
        "generation": 1,
        "codename": "Bloomfield",
        "architecture": "Nehalem",
        "socket": "LGA 1366",
        "releaseYear": 2009,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 8,
        "baseClockMhz": 2800,
        "boostClockMhz": None,
        "l2CacheMb": 1.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 130,
        "processNodeNm": 45,
        "isUnlocked": True,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 3,
        "maxMemoryGb": 24,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i7-930.c1468",
    },
    "intel core i3-2100": {
        "name": "Intel Core i3-2100",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3 2000",
        "generation": 2,
        "codename": "Sandy Bridge",
        "architecture": "Sandy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2011,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3100,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 65,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 2000",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-2100.c1488",
    },
    "intel core i3-2100t": {
        "name": "Intel Core i3-2100T",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3 2000",
        "generation": 2,
        "codename": "Sandy Bridge",
        "architecture": "Sandy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2011,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 2500,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 35,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 2000",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-2100t.c1489",
    },
    "intel core i3-3225": {
        "name": "Intel Core i3-3225",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3 3000",
        "generation": 3,
        "codename": "Ivy Bridge",
        "architecture": "Ivy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2012,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3300,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 55,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 4000",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-3225.c1515",
    },
    "intel core i3-4150": {
        "name": "Intel Core i3-4150",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3 4000",
        "generation": 4,
        "codename": "Haswell",
        "architecture": "Haswell",
        "socket": "LGA 1150",
        "releaseYear": 2013,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3500,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 54,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 4400",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-4150.c1534",
    },
    "intel core i3-4170": {
        "name": "Intel Core i3-4170",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3 4000",
        "generation": 4,
        "codename": "Haswell",
        "architecture": "Haswell",
        "socket": "LGA 1150",
        "releaseYear": 2015,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3700,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 54,
        "processNodeNm": 22,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 4400",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-4170.c1536",
    },
    "intel core i3-530": {
        "name": "Intel Core i3-530",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3",
        "generation": 1,
        "codename": "Clarkdale",
        "architecture": "Westmere",
        "socket": "LGA 1156",
        "releaseYear": 2010,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 2930,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 4.0,
        "tdpWatt": 73,
        "processNodeNm": 32,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 16,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-530.c1476",
    },
    "intel pentium g4560": {
        "name": "Intel Pentium G4560",
        "vendor": "INTEL",
        "family": "Pentium",
        "series": "Pentium",
        "generation": 7,
        "codename": "Kaby Lake",
        "architecture": "Kaby Lake",
        "socket": "LGA 1151",
        "releaseYear": 2017,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3500,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 54,
        "processNodeNm": 14,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 610",
        "memoryTypes": ["DDR4"],
        "memoryChannels": 2,
        "maxMemoryGb": 64,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/pentium-g4560.c2937",
    },
    "amd a8-7600": {
        "name": "AMD A8-7600",
        "vendor": "AMD",
        "family": "A8",
        "series": "A8 7000",
        "generation": None,
        "codename": "Kaveri",
        "architecture": "Steamroller",
        "socket": "FM2+",
        "releaseYear": 2014,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3100,
        "boostClockMhz": 3900,
        "l2CacheMb": 4.0,
        "l3CacheMb": 0.0,
        "tdpWatt": 65,
        "processNodeNm": 28,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Radeon R7 Graphics",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 64,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/a8-7600.c2560",
    },
    "amd a8-5600k": {
        "name": "AMD A8-5600K",
        "vendor": "AMD",
        "family": "A8",
        "series": "A8 5000",
        "generation": None,
        "codename": "Trinity",
        "architecture": "Piledriver",
        "socket": "FM2",
        "releaseYear": 2012,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3600,
        "boostClockMhz": 3900,
        "l2CacheMb": 4.0,
        "l3CacheMb": 0.0,
        "tdpWatt": 100,
        "processNodeNm": 32,
        "isUnlocked": True,
        "isX3d": False,
        "integratedGraphics": "Radeon HD 7560D",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 64,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/a8-5600k.c1981",
    },
    "amd a10-5800k": {
        "name": "AMD A10-5800K",
        "vendor": "AMD",
        "family": "A10",
        "series": "A10 5000",
        "generation": None,
        "codename": "Trinity",
        "architecture": "Piledriver",
        "socket": "FM2",
        "releaseYear": 2012,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3800,
        "boostClockMhz": 4100,
        "l2CacheMb": 4.0,
        "l3CacheMb": 0.0,
        "tdpWatt": 100,
        "processNodeNm": 32,
        "isUnlocked": True,
        "isX3d": False,
        "integratedGraphics": "Radeon HD 7660D",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 64,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/a10-5800k.c1983",
    },
    "amd phenom ii x4 945": {
        "name": "AMD Phenom II X4 945",
        "vendor": "AMD",
        "family": "Phenom II",
        "series": "Phenom II X4",
        "generation": None,
        "codename": "Deneb",
        "architecture": "K10",
        "socket": "AM3",
        "releaseYear": 2009,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3000,
        "boostClockMhz": None,
        "l2CacheMb": 2.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 95,
        "processNodeNm": 45,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 16,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/phenom-ii-x4-945.c1458",
    },
    "amd ryzen 3 1200": {
        "name": "AMD Ryzen 3 1200",
        "vendor": "AMD",
        "family": "Ryzen 3",
        "series": "Ryzen 3 1000",
        "generation": 1,
        "codename": "Summit Ridge",
        "architecture": "Zen",
        "socket": "AM4",
        "releaseYear": 2017,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3100,
        "boostClockMhz": 3400,
        "l2CacheMb": 2.0,
        "l3CacheMb": 8.0,
        "tdpWatt": 65,
        "processNodeNm": 14,
        "isUnlocked": True,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR4"],
        "memoryChannels": 2,
        "maxMemoryGb": 128,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/ryzen-3-1200.c2940",
    },
    "intel core i5-6500": {
        "name": "Intel Core i5-6500",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 6000",
        "generation": 6,
        "codename": "Skylake",
        "architecture": "Skylake",
        "socket": "LGA 1151",
        "releaseYear": 2015,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3200,
        "boostClockMhz": 3600,
        "l2CacheMb": 1.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 65,
        "processNodeNm": 14,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 530",
        "memoryTypes": ["DDR4"],
        "memoryChannels": 2,
        "maxMemoryGb": 64,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-6500.c2807",
    },
    "intel core i3-6300": {
        "name": "Intel Core i3-6300",
        "vendor": "INTEL",
        "family": "Core i3",
        "series": "Core i3 6000",
        "generation": 6,
        "codename": "Skylake",
        "architecture": "Skylake",
        "socket": "LGA 1151",
        "releaseYear": 2015,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3800,
        "boostClockMhz": None,
        "l2CacheMb": 0.5,
        "l3CacheMb": 4.0,
        "tdpWatt": 51,
        "processNodeNm": 14,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 530",
        "memoryTypes": ["DDR4"],
        "memoryChannels": 2,
        "maxMemoryGb": 64,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i3-6300.c2803",
    },
    "intel core i5-3570k": {
        "name": "Intel Core i5-3570K",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 3000",
        "generation": 3,
        "codename": "Ivy Bridge",
        "architecture": "Ivy Bridge",
        "socket": "LGA 1155",
        "releaseYear": 2012,
        "performanceCores": 4,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 3400,
        "boostClockMhz": 3900,
        "l2CacheMb": 1.0,
        "l3CacheMb": 6.0,
        "tdpWatt": 77,
        "processNodeNm": 22,
        "isUnlocked": True,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 4000",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-3570k.c1619",
    },
    "intel core 2 duo e8400": {
        "name": "Intel Core 2 Duo E8400",
        "vendor": "INTEL",
        "family": "Core 2 Duo",
        "series": "Core 2 Duo",
        "generation": None,
        "codename": "Wolfdale",
        "architecture": "Core",
        "socket": "LGA 775",
        "releaseYear": 2008,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 2,
        "baseClockMhz": 3000,
        "boostClockMhz": None,
        "l2CacheMb": 6.0,
        "l3CacheMb": None,
        "tdpWatt": 65,
        "processNodeNm": 45,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR2"],
        "memoryChannels": 2,
        "maxMemoryGb": 8,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-2-duo-e8400.c149",
    },
    "intel core 2 duo e6400": {
        "name": "Intel Core 2 Duo E6400",
        "vendor": "INTEL",
        "family": "Core 2 Duo",
        "series": "Core 2 Duo",
        "generation": None,
        "codename": "Conroe",
        "architecture": "Core",
        "socket": "LGA 775",
        "releaseYear": 2006,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 2,
        "baseClockMhz": 2130,
        "boostClockMhz": None,
        "l2CacheMb": 4.0,
        "l3CacheMb": None,
        "tdpWatt": 65,
        "processNodeNm": 65,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR2"],
        "memoryChannels": 2,
        "maxMemoryGb": 8,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-2-duo-e6400.c147",
    },
    "amd phenom x3 8650": {
        "name": "AMD Phenom X3 8650",
        "vendor": "AMD",
        "family": "Phenom",
        "series": "Phenom X3",
        "generation": None,
        "codename": "Toliman",
        "architecture": "K10",
        "socket": "AM2+",
        "releaseYear": 2008,
        "performanceCores": 3,
        "efficiencyCores": 0,
        "threads": 3,
        "baseClockMhz": 2300,
        "boostClockMhz": None,
        "l2CacheMb": 1.5,
        "l3CacheMb": 2.0,
        "tdpWatt": 95,
        "processNodeNm": 65,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR2"],
        "memoryChannels": 2,
        "maxMemoryGb": 16,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/phenom-x3-8650.c152",
    },
    "amd athlon 64 x2 5600+": {
        "name": "AMD Athlon 64 X2 5600+",
        "vendor": "AMD",
        "family": "Athlon 64 X2",
        "series": "Athlon 64 X2",
        "generation": None,
        "codename": "Windsor",
        "architecture": "K8",
        "socket": "AM2",
        "releaseYear": 2006,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 2,
        "baseClockMhz": 2900,
        "boostClockMhz": None,
        "l2CacheMb": 2.0,
        "l3CacheMb": None,
        "tdpWatt": 89,
        "processNodeNm": 90,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": None,
        "memoryTypes": ["DDR2"],
        "memoryChannels": 2,
        "maxMemoryGb": 16,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/athlon-64-x2-5600-plus.c122",
    },
    "intel core i5-5200u": {
        "name": "Intel Core i5-5200U",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 5000U",
        "generation": 5,
        "codename": "Broadwell",
        "architecture": "Broadwell",
        "socket": "BGA 1356",
        "releaseYear": 2015,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 2200,
        "boostClockMhz": 2700,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 15,
        "processNodeNm": 14,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 5500",
        "memoryTypes": ["DDR3"],
        "memoryChannels": 2,
        "maxMemoryGb": 16,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-5200u.c2638",
    },
    "intel core i5-6200u": {
        "name": "Intel Core i5-6200U",
        "vendor": "INTEL",
        "family": "Core i5",
        "series": "Core i5 6000U",
        "generation": 6,
        "codename": "Skylake",
        "architecture": "Skylake",
        "socket": "BGA 1356",
        "releaseYear": 2015,
        "performanceCores": 2,
        "efficiencyCores": 0,
        "threads": 4,
        "baseClockMhz": 2300,
        "boostClockMhz": 2800,
        "l2CacheMb": 0.5,
        "l3CacheMb": 3.0,
        "tdpWatt": 15,
        "processNodeNm": 14,
        "isUnlocked": False,
        "isX3d": False,
        "integratedGraphics": "Intel HD Graphics 520",
        "memoryTypes": ["DDR4"],
        "memoryChannels": 2,
        "maxMemoryGb": 32,
        "sourceUrl": "https://www.techpowerup.com/cpu-specs/core-i5-6200u.c2800",
    },
}

MANUAL_CPU_BY_NAME = {normalize(entry["name"]): entry for entry in MANUAL_CPU.values()}

CPU_TARGETS = [
    "Intel Core 2 Duo E8400",
    "Intel Core 2 Duo E6400",
    "AMD Phenom X3 8650",
    "AMD Athlon 64 X2 5600+",
]

GPU_KEY_ALIASES = {
    "geforce 760": "geforce gtx 760",
    "geforce 970": "geforce gtx 970",
    "geforce 2060": "geforce rtx 2060",
    "geforce 6600": "geforce 6600",
    "geforce 500": "geforce gts 450",
    "geforce gtx 450": "geforce gtx 450",
    "geforce gtx 5570": "radeon hd 5570",
    "geforce gtx 770": "geforce gtx 770",
    "geforce gtx 7970": "radeon hd 7970",
    "geforce 6800": "geforce 6600",
    "radeon hd 8800": "radeon hd 7970",
}

# GPU canonical names to pull from TechPowerUp reference CSV (2025-12.csv).
GPU_TARGETS = [
    "GeForce GT 1030",
    "GeForce GTX 630",
    "GeForce GTS 450",
    "GeForce GTX 760",
    "GeForce GTX 970",
    "GeForce RTX 2060",
    "GeForce 9800 GT",
    "GeForce 9600 GT",
    "GeForce 8600 GT",
    "GeForce 6600",
    "GeForce GTX 450",
    "GeForce GTX 550 Ti",
    "Radeon HD 6570",
    "Radeon HD 5450",
    "Radeon HD 5570",
    "Radeon HD 4870",
    "Radeon HD 2600 XT",
    "Radeon HD 3600",
    "Radeon HD 6870",
    "Radeon HD 7870",
    "Radeon HD 7970",
    "Radeon HD 4650",
    "Radeon HD 8800",
    "Radeon R7 270X",
    "Radeon R7 250",
    "Radeon R7 240",
    "Radeon RX 580",
    "Radeon X1300",
]


def load_existing_keys() -> tuple[set[str], set[str], set[str], set[str]]:
    cpu_keys: set[str] = set()
    gpu_keys: set[str] = set()
    cpu_slugs: set[str] = set()
    gpu_slugs: set[str] = set()

    for path, bucket, slug_bucket in (
        (HARDWARE / "cpu-data.ts", cpu_keys, cpu_slugs),
        (HARDWARE / "gpu-data.ts", gpu_keys, gpu_slugs),
    ):
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r"name:\s*'([^']+)'", text):
            bucket.add(normalize(match.group(1)))
        for match in re.finditer(r"slug:\s*'([^']+)'", text):
            slug_bucket.add(match.group(1))

    return cpu_keys, gpu_keys, cpu_slugs, gpu_slugs


def extract_queries(kind: str, raw_text: str) -> set[str]:
    patterns = CPU_QUERY_RES if kind == "CPU" else GPU_QUERY_RES
    found: set[str] = set()

    for pattern in patterns:
        for match in pattern.finditer(raw_text):
            if kind == "CPU":
                if pattern.pattern.startswith("\\bi("):
                    found.add(f"intel core i{match.group(1)}-{match.group(2).lower()}")
                elif "ryzen" in pattern.pattern:
                    found.add(f"amd ryzen {match.group(1)} {match.group(2).lower()}")
                elif "fx" in pattern.pattern:
                    found.add(f"amd fx-{match.group(1)}")
                elif "a(" in pattern.pattern:
                    found.add(f"amd a{match.group(1)}-{match.group(2).lower()}")
                elif "phenom" in pattern.pattern:
                    found.add(f"amd phenom x{match.group(1)} {match.group(2)}")
                elif "pentium" in pattern.pattern:
                    found.add(f"intel pentium g{match.group(1)}")
                elif "core 2" in pattern.pattern:
                    found.add(f"intel core 2 duo e{match.group(1)}")
                elif "athlon" in pattern.pattern:
                    found.add(f"amd athlon 64 x2 {match.group(1)}+")
            else:
                if pattern.pattern.startswith("\\b(?:geforce\\s+)?\\(gt"):
                    family = match.group(1).lower()
                    model = match.group(2).strip().lower()
                    found.add(f"geforce {family} {model}")
                elif "geforce\\s+(\\d{3,4})\\s+gt" in pattern.pattern:
                    found.add(f"geforce {match.group(1).strip().lower()} gt")
                elif "hd" in pattern.pattern:
                    found.add(f"radeon hd {match.group(1)}")
                elif "rx" in pattern.pattern or "r[79]" in pattern.pattern:
                    prefix = raw_text[match.start() : match.start() + 12].lower()
                    token = match.group(1).strip().lower()
                    if "r7" in prefix:
                        found.add(f"radeon r7 {token}")
                    elif "r9" in prefix:
                        found.add(f"radeon r9 {token}")
                    else:
                        found.add(f"radeon rx {token}")
                elif pattern.pattern.startswith("\\bnvidia"):
                    found.add(f"geforce gtx {match.group(1).strip().lower()}")
                elif "amd|ati" in pattern.pattern:
                    found.add(f"radeon hd {match.group(1).strip().lower()}")
                elif pattern.pattern.startswith("\\bgeforce\\s+(\\d"):
                    found.add(f"geforce {match.group(1).strip().lower()}")
                else:
                    found.add(f"geforce gtx {match.group(1).strip().lower()}")

    return {normalize(value) for value in found if not AMBIGUOUS_CPU.match(value) and not AMBIGUOUS_GPU.match(value)}


def parse_unmatched(path: Path | None = None) -> tuple[Counter[str], Counter[str]]:
    cpu_need: Counter[str] = Counter()
    gpu_need: Counter[str] = Counter()
    source = path or UNMATCHED

    with source.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get("isGeneric", "").lower() == "true":
                continue
            kind = row["kind"]
            raw = row["rawText"]
            weight = int(row.get("gameCount") or "1")
            for query in extract_queries(kind, raw):
                if kind == "CPU":
                    cpu_need[query] += weight
                else:
                    gpu_need[query] += weight

    return cpu_need, gpu_need


def load_buildcores_cpu_index(buildcores: Path) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for file in glob.glob(str(buildcores / "open-db" / "CPU" / "*.json")):
        try:
            with open(file, encoding="utf-8") as handle:
                data = json.load(handle)
        except (json.JSONDecodeError, OSError):
            continue
        name = clean_cpu_name((data.get("metadata") or {}).get("name") or "")
        if name:
            index[normalize(name)] = data
    return index


def cpu_from_buildcores(data: dict[str, Any]) -> dict[str, Any]:
    meta = data.get("metadata") or {}
    name = clean_cpu_name(meta.get("name") or "")
    vendor = vendor_of(meta.get("manufacturer", ""))
    cores = data.get("cores") or {}
    clocks = (data.get("clocks") or {}).get("performance") or {}
    specs = data.get("specifications") or {}
    cache = data.get("cache") or {}
    memory = specs.get("memory") or {}
    igpu = (specs.get("integratedGraphics") or {}).get("model") or ""
    igpu = None if igpu.strip().lower() in {"", "none"} else igpu.strip()
    total_cores = positive_int(cores.get("total")) or 0
    perf_cores = positive_int(cores.get("performance")) or total_cores
    eff_cores = integer(cores.get("efficiency")) or 0
    if perf_cores + eff_cores != total_cores:
        perf_cores, eff_cores = total_cores, 0
    base_ghz = num(clocks.get("base"))
    boost_ghz = num(clocks.get("boost"))
    year = meta.get("releaseYear")
    year = year if isinstance(year, int) and 2005 <= year <= 2030 else None

    return {
        "slug": slugify(name),
        "name": name,
        "vendor": vendor,
        "family": (meta.get("series") or "").strip() or None,
        "series": (data.get("series") or "").strip() or None,
        "generation": cpu_generation(data.get("series") or "", name),
        "codename": (data.get("coreFamily") or "").strip() or None,
        "architecture": (data.get("microarchitecture") or "").strip() or None,
        "socket": (data.get("socket") or "").strip(),
        "releaseYear": year,
        "performanceCores": perf_cores,
        "efficiencyCores": eff_cores,
        "threads": positive_int(cores.get("threads")) or total_cores,
        "baseClockMhz": round((base_ghz or 0) * 1000),
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
        "sourceUrl": (data.get("general_product_information") or {}).get("manufacturer_url")
        or BUILDCORES_URL,
    }


def load_tpu_reference(datasets: Path) -> dict[str, dict[str, str]]:
    path = datasets / "2025-12.csv"
    index: dict[str, dict[str, str]] = {}
    if not path.exists():
        return index
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            manufacturer = (row.get("manufacturer") or "").strip()
            name = (row.get("name") or "").strip()
            if not name:
                continue
            if GPU_LAPTOP_RE.search(name):
                continue
            if "PCIe" not in (row.get("bus_interface") or ""):
                continue
            if manufacturer not in {"NVIDIA", "AMD", "ATI"}:
                continue
            for key in gpu_lookup_keys(name):
                index.setdefault(key, row)
    return index


def load_gpuark_gpi(datasets: Path) -> dict[str, float]:
    path = datasets / "gpuark-gpu-specs.csv"
    scores: dict[str, list[float]] = defaultdict(list)
    if not path.exists():
        return {}
    with path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            raw_name = (row.get("name") or "").strip()
            gpi = num(row.get("gpi_value"))
            if not raw_name or not gpi:
                continue
            canonical = gpu_canonical_name(raw_name)
            for key in gpu_lookup_keys(canonical):
                scores[key].append(gpi)
    return {key: sum(values) / len(values) for key, values in scores.items()}


def read_max_gpi() -> float:
    text = (HARDWARE / "gpu-data.ts").read_text(encoding="utf-8")
    scores = [float(match) for match in re.findall(r"gpiScore:\s*([\d.]+)", text)]
    return max(scores) if scores else 1.0


def gpu_from_reference(
    canonical: str,
    row: dict[str, str],
    gpi_lookup: dict[str, float],
    max_gpi: float,
    rank: int,
) -> dict[str, Any] | None:
    vendor = vendor_of(row.get("manufacturer") or "")
    if vendor not in {"NVIDIA", "AMD"}:
        return None

    name = canonical
    if vendor == "NVIDIA" and not name.lower().startswith("nvidia"):
        name = f"NVIDIA {name}"
    elif vendor == "AMD" and not name.lower().startswith(("amd", "ati")):
        name = f"AMD {name.replace('ATI ', 'Radeon ')}"

    keys = gpu_lookup_keys(canonical)
    gpi = lookup_gpi(gpi_lookup, keys)
    if not gpi:
        # GPU Ark skips many pre-2010 cards; keep a small placeholder so the row
        # still seeds and requirement aliases can resolve.
        gpi = 0.5

    pcie_version, pcie_lanes = parse_pcie(row.get("bus_interface") or "")
    vram = num(row.get("memory_size_gb"))
    vram_gb = round(vram) if vram and vram >= 1 else None
    release = (row.get("release_date") or "")[:10] or None
    year = int(release[:4]) if release and release[:4].isdigit() else 0
    if year and year < GPU_MIN_YEAR:
        pass  # requirement supplement: keep older cards anyway

    supports_rt = "rtx" in canonical.lower()

    return {
        "slug": slugify(name),
        "name": name,
        "vendor": vendor,
        "formFactor": "DESKTOP",
        "popularityRank": 250 + rank,
        "performanceRank": 250 + rank,
        "family": (row.get("generation") or "").strip() or None,
        "series": name,
        "architecture": (row.get("architecture") or "").strip() or None,
        "codename": (row.get("gpu_name") or "").strip() or None,
        "releaseDate": release,
        "shadingUnits": positive_int(row.get("shading_units")),
        "tmus": positive_int(row.get("texture_mapping_units")),
        "rops": positive_int(row.get("render_output_processors")),
        "tensorCores": positive_int(row.get("tensor_cores")),
        "rayTracingCores": positive_int(row.get("ray_tracing_cores")),
        "baseClockMhz": positive_int(num(row.get("base_clock_mhz"))),
        "boostClockMhz": positive_int(num(row.get("boost_clock_mhz"))),
        "memoryClockMhz": positive_int(num(row.get("memory_clock_mhz"))),
        "vramGb": vram_gb,
        "memoryType": (row.get("memory_type") or "").strip() or None,
        "memoryBusBits": positive_int(row.get("memory_bus_bits")),
        "bandwidthGbps": num(row.get("memory_bandwidth_gb_s")),
        "busInterface": (row.get("bus_interface") or "").strip() or None,
        "pcieVersion": pcie_version,
        "pcieLanes": pcie_lanes,
        "tdpWatt": positive_int(row.get("thermal_design_power_w")),
        "recommendedPsuW": positive_int(row.get("suggested_psu_w")),
        "supportsRayTracing": supports_rt,
        "retailBoardCount": 0,
        "gpiScore": round(gpi, 2),
        "gamingIndex": round(gpi / max_gpi * 100, 2),
        "sourceUrl": row.get("tpu_url") or GPU_ARK_URL,
    }


def lookup_gpi(gpi_lookup: dict[str, float], keys: list[str]) -> float | None:
    for key in keys:
        if key in gpi_lookup:
            return gpi_lookup[key]
    return None


CPU_CATALOG_FIELDS = [
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

GPU_CATALOG_FIELDS = [
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


def append_to_catalog(
    path: Path, rows: list[dict[str, Any]], fields: list[str]
) -> int:
    if not rows:
        return 0
    text = path.read_text(encoding="utf-8").rstrip()
    if not text.endswith("];"):
        raise SystemExit(f"Unexpected format in {path}")
    body = text[:-2].rstrip()
    while body.endswith(","):
        body = body[:-1].rstrip()
    insertion = ",\n" + ",\n".join(
        ts_object([(field, row[field]) for field in fields]) for row in rows
    )
    path.write_text(f"{body}{insertion}\n];\n", encoding="utf-8")
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--buildcores", type=Path, required=True)
    parser.add_argument("--datasets", type=Path, required=True)
    parser.add_argument(
        "--unmatched",
        type=Path,
        default=UNMATCHED,
        help="CSV report of unmatched requirement texts (default: unmatched.csv)",
    )
    args = parser.parse_args()

    existing_cpu, existing_gpu, existing_cpu_slugs, existing_gpu_slugs = load_existing_keys()
    cpu_need, gpu_need = parse_unmatched(args.unmatched)

    buildcores_index = load_buildcores_cpu_index(args.buildcores)
    tpu_index = load_tpu_reference(args.datasets)
    gpi_lookup = load_gpuark_gpi(args.datasets)
    max_gpi = read_max_gpi()

    cpu_rows: list[dict[str, Any]] = []
    cpu_seen: set[str] = set()

    wanted_cpu_weights = Counter(cpu_need)
    for target in CPU_TARGETS:
        wanted_cpu_weights[normalize(target)] += 1

    for key, _weight in wanted_cpu_weights.most_common():
        if key in existing_cpu or key in cpu_seen:
            continue
        manual = MANUAL_CPU_BY_NAME.get(key)
        if manual:
            row = {"slug": slugify(manual["name"]), **manual}
        elif key in buildcores_index:
            row = cpu_from_buildcores(buildcores_index[key])
        else:
            continue
        if row["slug"] in existing_cpu_slugs:
            continue
        norm = normalize(row["name"])
        if norm in existing_cpu or norm in cpu_seen:
            continue
        cpu_seen.add(norm)
        cpu_rows.append(row)

    gpu_rows: list[dict[str, Any]] = []
    gpu_seen: set[str] = set()
    rank = 1

    wanted_gpu_keys = set(gpu_need.keys())
    for target in GPU_TARGETS:
        wanted_gpu_keys.add(normalize(target))

    for key in sorted(wanted_gpu_keys, key=lambda value: -gpu_need.get(value, 0)):
        if key in existing_gpu or key in gpu_seen:
            continue
        lookup_key = GPU_KEY_ALIASES.get(key, key)
        row = tpu_index.get(lookup_key)
        if not row:
            for target in GPU_TARGETS:
                if normalize(target) == key:
                    for lookup_key in gpu_lookup_keys(target):
                        row = tpu_index.get(lookup_key)
                        if row:
                            break
                if row:
                    break
        if not row:
            continue
        canonical = gpu_canonical_name(row["name"])
        built = gpu_from_reference(canonical, row, gpi_lookup, max_gpi, rank)
        if not built:
            continue
        if built["slug"] in existing_gpu_slugs:
            continue
        norm = normalize(built["name"])
        if norm in existing_gpu or norm in gpu_seen:
            continue
        gpu_seen.add(norm)
        gpu_rows.append(built)
        rank += 1

    cpu_added = append_to_catalog(
        HARDWARE / "cpu-data.ts", cpu_rows, CPU_CATALOG_FIELDS
    )
    gpu_added = append_to_catalog(
        HARDWARE / "gpu-data.ts", gpu_rows, GPU_CATALOG_FIELDS
    )

    print(f"CPU catalogue: appended {cpu_added} entries")
    print(f"GPU catalogue: appended {gpu_added} entries")
    print(f"Top unmatched CPU keys still missing: ", end="")
    missing_cpu = [
        key
        for key, _ in cpu_need.most_common(15)
        if key not in existing_cpu and normalize(key) not in cpu_seen
    ]
    print(", ".join(missing_cpu[:10]) or "none")
    print(f"Top unmatched GPU keys still missing: ", end="")
    missing_gpu = [
        key
        for key, _ in gpu_need.most_common(15)
        if key not in existing_gpu and key not in gpu_seen
    ]
    print(", ".join(missing_gpu[:10]) or "none")


if __name__ == "__main__":
    main()
