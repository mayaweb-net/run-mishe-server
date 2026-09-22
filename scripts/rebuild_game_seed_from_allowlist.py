"""Rebuild game-data.ts from the curated allowlist (document/games.md).

Reads steamAppIds from seed/games/game-allowlist.ts (parsed lightly),
fetches Steam appdetails (cached under .temp/steam-appdetails/), and
writes seed/games/game-data.ts.

Non-Steam titles (steamAppId null) are skipped here — seed them as stubs
in seed/games/game.ts.
"""

from __future__ import annotations

import argparse
import re
import time
from typing import Any

from build_game_seed import (
    CACHE_DIR,
    OUTPUT_PATH,
    REPO,
    fetch_app,
    normalize_game,
    write_typescript,
)

ALLOWLIST_PATH = (
    REPO
    / "src"
    / "app"
    / "db"
    / "prisma"
    / "seed"
    / "games"
    / "game-allowlist.ts"
)

NAME_RE = re.compile(r"name:\s*(['\"])(.*?)\1")
STEAM_ID_RE = re.compile(r"steamAppId:\s*(\d+|null)")


def normalize_title(value: str) -> str:
    value = value.casefold()
    for ch in "™®©":
        value = value.replace(ch, "")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return value.strip()


def titles_compatible(
    expected: str,
    actual: str | None,
    aliases: list[str] | None = None,
) -> bool:
    if not actual:
        return False
    right = normalize_title(actual)
    for candidate in [expected, *(aliases or [])]:
        left = normalize_title(candidate)
        if left == right:
            return True
        if left in right or right in left:
            return True
        left_tokens = set(left.split())
        right_tokens = set(right.split())
        if not left_tokens or not right_tokens:
            continue
        overlap = len(left_tokens & right_tokens) / max(len(left_tokens), 1)
        if overlap >= 0.6:
            return True
    return False


def parse_allowlist() -> list[dict[str, Any]]:
    text = ALLOWLIST_PATH.read_text(encoding="utf-8")
    chunks = re.split(r"\n  \{\n", text)
    entries: list[dict[str, Any]] = []
    for chunk in chunks[1:]:
        name_match = NAME_RE.search(chunk)
        id_match = STEAM_ID_RE.search(chunk)
        if not name_match or not id_match:
            continue
        steam_raw = id_match.group(1)
        alias_block = re.search(r"aliases:\s*\[([\s\S]*?)\]", chunk)
        aliases: list[str] = []
        if alias_block:
            aliases = [
                match.group(1)
                for match in re.finditer(
                    r"['\"]([^'\"]+)['\"]",
                    alias_block.group(1),
                )
            ]
        entries.append(
            {
                "name": name_match.group(2).replace("\\'", "'"),
                "steamAppId": None if steam_raw == "null" else int(steam_raw),
                "aliases": aliases,
            }
        )
    return entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--delay", type=float, default=0.35)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only resolve/allowlist report; do not write game-data.ts",
    )
    args = parser.parse_args()

    allowlist = parse_allowlist()
    steam_entries = [e for e in allowlist if e["steamAppId"] is not None]
    non_steam = [e for e in allowlist if e["steamAppId"] is None]

    print(f"Allowlist: {len(allowlist)} unique titles")
    print(f"  Steam: {len(steam_entries)}")
    print(f"  Non-Steam (skipped): {len(non_steam)}")
    for entry in non_steam:
        print(f"    - {entry['name']}")

    games: list[dict[str, Any]] = []
    failed: list[tuple[int, str, str]] = []

    for index, entry in enumerate(steam_entries, 1):
        app_id = entry["steamAppId"]
        cache_path = CACHE_DIR / f"{app_id}.json"
        needs_fetch = args.refresh or not cache_path.exists()
        row = {
            "rank": str(index),
            "sourceRank": str(index),
            "steamAppId": str(app_id),
            "name": entry["name"],
            "currentPlayers": "0",
            "coverUrl": "",
        }
        try:
            result = fetch_app(app_id, refresh=args.refresh)
            steam_name = (
                ((result.get("data") or {}).get("name"))
                if result.get("success")
                else None
            )
            if steam_name and not titles_compatible(
                entry["name"],
                steam_name,
                entry.get("aliases"),
            ):
                failed.append(
                    (
                        app_id,
                        entry["name"],
                        f"name mismatch: Steam has {steam_name!r}",
                    )
                )
                status = "mismatch"
            else:
                game = normalize_game(row, result)
                if game:
                    game["name"] = entry["name"]
                    game["rank"] = index
                    game["sourceRank"] = index
                    game["popularity"] = max(game.get("popularity") or 0, 0)
                    games.append(game)
                    status = "ok"
                else:
                    failed.append((app_id, entry["name"], "not type=game / empty"))
                    status = "skip"
        except RuntimeError as error:
            failed.append((app_id, entry["name"], str(error)))
            status = "fail"

        print(f"[{index:03}/{len(steam_entries):03}] {app_id} {entry['name']}: {status}")
        if needs_fetch and index < len(steam_entries):
            time.sleep(args.delay)

    if args.dry_run:
        print(f"Dry run: would write {len(games)} games")
        if failed:
            print(f"Failed {len(failed)}:")
            for app_id, name, reason in failed:
                print(f"  {app_id} {name}: {reason}")
        return

    write_typescript(games)
    print(f"Wrote {len(games)} games to {OUTPUT_PATH.relative_to(REPO)}")
    if failed:
        print(f"Failed {len(failed)}:")
        for app_id, name, reason in failed:
            print(f"  {app_id} {name}: {reason}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
