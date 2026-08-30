"""Fetch Steam appdetails and generate the checked-in game seed dataset.

The popularity list comes from `.temp/steam-charts/game.csv` (produced by
`parse_steam_charts.py`). Steam Store responses are cached under
`.temp/steam-appdetails/` so an interrupted run can resume.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
GAMES_DIR = REPO / "src" / "app" / "db" / "prisma" / "seed" / "games"
CSV_PATH = REPO / ".temp" / "steam-charts" / "game.csv"
OUTPUT_PATH = GAMES_DIR / "game-data.ts"
CACHE_DIR = REPO / ".temp" / "steam-appdetails"
API_URL = "https://store.steampowered.com/api/appdetails"
USER_AGENT = "run-mishe-seed-builder/1.0"

TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"[ \t]+")
LABEL_RE = re.compile(
    r"(?im)^(OS|Processor|Memory|Graphics|DirectX|Storage|Network|"
    r"Sound Card|VR Support|Additional Notes):\s*"
)


def clean_html(value: str | None) -> str | None:
    if not value:
        return None
    value = re.sub(r"(?i)<br\s*/?>|</li>|</p>", "\n", value)
    value = TAG_RE.sub("", value)
    value = html.unescape(value).replace("\r", "")
    value = "\n".join(
        SPACE_RE.sub(" ", line).strip()
        for line in value.splitlines()
        if line.strip()
    )
    return value or None


def requirement_fields(value: str | None) -> dict[str, str]:
    text = clean_html(value)
    if not text:
        return {}

    matches = list(LABEL_RE.finditer(text))
    fields: dict[str, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        fields[match.group(1).lower()] = text[match.end() : end].strip()
    return fields


def first_number(pattern: str, value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(pattern, value, re.I)
    return int(match.group(1)) if match else None


def parse_requirement(tier: str, raw: str | None) -> dict[str, Any] | None:
    fields = requirement_fields(raw)
    if not fields:
        return None

    memory = fields.get("memory")
    storage = fields.get("storage")
    graphics = fields.get("graphics")
    notes = fields.get("additional notes")
    combined = " ".join(value for value in fields.values())

    return {
        "tier": tier,
        "rawCpuText": fields.get("processor"),
        "rawGpuText": graphics,
        "os": fields.get("os"),
        "ramGb": first_number(r"(\d+)\s*GB(?:\s+of)?\s+RAM", memory),
        "vramGb": first_number(r"(\d+)\s*GB(?:\s+(?:VRAM|Video))", graphics),
        "storageGb": first_number(r"(\d+)\s*GB", storage),
        "directX": fields.get("directx"),
        "needsSsd": bool(re.search(r"\bSSD\b|solid[\s-]+state", combined, re.I)),
        "notes": notes,
    }


def fetch_app(app_id: int, *, refresh: bool, retries: int = 5) -> dict[str, Any]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{app_id}.json"
    if cache_path.exists() and not refresh:
        return json.loads(cache_path.read_text(encoding="utf-8"))

    query = urllib.parse.urlencode(
        {"appids": app_id, "cc": "us", "l": "english"}
    )
    request = urllib.request.Request(
        f"{API_URL}?{query}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )

    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.load(response)
            result = payload.get(str(app_id), {"success": False})
            cache_path.write_text(
                json.dumps(result, ensure_ascii=False),
                encoding="utf-8",
            )
            return result
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            if attempt == retries - 1:
                raise RuntimeError(f"Steam request failed for {app_id}: {error}") from error
            time.sleep(min(2**attempt, 16))

    raise AssertionError("unreachable")


def parse_release_date(value: dict[str, Any] | None) -> str | None:
    if not value or value.get("coming_soon"):
        return None
    raw = value.get("date")
    if not raw:
        return None
    for pattern in ("%b %d, %Y", "%d %b, %Y", "%b %Y", "%Y"):
        try:
            parsed = datetime.strptime(raw, pattern)
            return parsed.date().isoformat()
        except ValueError:
            pass
    return None


def normalize_game(row: dict[str, str], result: dict[str, Any]) -> dict[str, Any] | None:
    if not result.get("success"):
        # Steam occasionally returns success=false for region-restricted apps.
        # Keep the already verified Steam Charts row, but do not invent any
        # metadata or requirements for it.
        return {
            "rank": int(row["rank"]),
            "sourceRank": int(row["sourceRank"]),
            "steamAppId": int(row["steamAppId"]),
            "name": row["name"],
            "releaseDate": None,
            "developer": None,
            "publisher": None,
            "genres": [],
            "coverUrl": row.get("coverUrl") or None,
            "description": None,
            "popularity": int(row["currentPlayers"]),
            "sourceName": "Steam Charts",
            "sourceUrl": f"https://steamcharts.com/app/{row['steamAppId']}",
            "requirements": [],
            "steamSnapshot": {"success": False},
        }

    data = result.get("data") or {}
    if data.get("type") != "game":
        return None

    requirements = data.get("pc_requirements") or {}
    parsed_requirements = [
        parsed
        for parsed in (
            parse_requirement("MINIMUM", requirements.get("minimum")),
            parse_requirement("RECOMMENDED", requirements.get("recommended")),
        )
        if parsed
    ]
    developers = data.get("developers") or []
    publishers = data.get("publishers") or []

    return {
        "rank": int(row["rank"]),
        "sourceRank": int(row["sourceRank"]),
        "steamAppId": int(row["steamAppId"]),
        "name": data.get("name") or row["name"],
        "releaseDate": parse_release_date(data.get("release_date")),
        "developer": ", ".join(developers) or None,
        "publisher": ", ".join(publishers) or None,
        "genres": [
            genre["description"]
            for genre in data.get("genres") or []
            if genre.get("description")
        ],
        "coverUrl": data.get("header_image") or row.get("coverUrl") or None,
        "description": clean_html(data.get("short_description")),
        "popularity": int(row["currentPlayers"]),
        "sourceName": "Steam Store + Steam Charts",
        "sourceUrl": f"https://store.steampowered.com/app/{row['steamAppId']}",
        "requirements": parsed_requirements,
        "steamSnapshot": {
            "type": data.get("type"),
            "isFree": data.get("is_free"),
            "requiredAge": data.get("required_age"),
            "platforms": data.get("platforms"),
            "categories": data.get("categories"),
            "recommendations": data.get("recommendations"),
            "releaseDate": data.get("release_date"),
            "pcRequirements": requirements,
        },
    }


def write_typescript(games: list[dict[str, Any]]) -> None:
    serialized = json.dumps(games, ensure_ascii=False, indent=2)
    output = (
        "// Generated by scripts/build_game_seed.py. Do not edit manually.\n"
        "import type { GameSeed } from './types';\n\n"
        f"export const GAME_SEED = {serialized} as const satisfies readonly GameSeed[];\n"
    )
    OUTPUT_PATH.write_text(output, encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--delay", type=float, default=0.4)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if args.limit:
        rows = rows[: args.limit]

    games: list[dict[str, Any]] = []
    failed: list[tuple[int, str]] = []
    for index, row in enumerate(rows, 1):
        app_id = int(row["steamAppId"])
        try:
            result = fetch_app(app_id, refresh=args.refresh)
            game = normalize_game(row, result)
            if game:
                games.append(game)
            else:
                failed.append((app_id, "unsuccessful or not type=game"))
        except RuntimeError as error:
            failed.append((app_id, str(error)))

        print(f"[{index:03}/{len(rows):03}] {app_id}: {'ok' if games and games[-1]['steamAppId'] == app_id else 'skip'}")
        if index < len(rows):
            time.sleep(args.delay)

    write_typescript(games)
    print(f"Wrote {len(games)} games to {OUTPUT_PATH.relative_to(REPO)}")
    if failed:
        print(f"Skipped {len(failed)} rows:")
        for app_id, reason in failed:
            print(f"  {app_id}: {reason}")


if __name__ == "__main__":
    main()
