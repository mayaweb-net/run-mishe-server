"""Parse Steam Charts HTML into `.temp/steam-charts/game.csv`, dropping non-games.

Put the charts `<tbody>` HTML at `.temp/steam-charts/game.html` (or pass a path).
"""

from __future__ import annotations

import csv
import html as html_lib
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TEMP_DIR = REPO / ".temp" / "steam-charts"
DEFAULT_HTML = TEMP_DIR / "game.html"
OUT = TEMP_DIR / "game.csv"
COVER_BASE = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps"

# Tools, launchers, mod clients, desktop toys — not useful for FPS / run-check.
EXCLUDE_APP_IDS = {
    480,  # Spacewar (Steam DRM dummy)
    431960,  # Wallpaper Engine
    629520,  # Soundpad
    993090,  # Lossless Scaling
    1281930,  # tModLoader
    1283970,  # YoloMouse
    1325860,  # VTube Studio
    1366800,  # Crosshair X
    1905180,  # OBS Studio
    1920960,  # VPet
    2250040,  # Crosshair V2
    2676230,  # FiveM
    3419430,  # Bongo Cat
    365670,  # Blender
    3678970,  # TBH: Task Bar Hero
    4333400,  # RedM
}

ROW_RE = re.compile(
    r'data-appid="(?P<appid>\d+)"'
    r'.*?data-capsule="(?P<capsule>[^"]*)"'
    r'.*?<a class="b" href="/app/\d+/charts/">(?P<name>.*?)</a>'
    r'.*?<td data-sort="(?P<players>\d+)"',
    re.S,
)


def cover_url(app_id: str, capsule: str) -> str:
    capsule = capsule.strip()
    if capsule.startswith("http"):
        return capsule
    if capsule.startswith("/"):
        return f"https://steamcharts.com{capsule}"
    return f"{COVER_BASE}/{app_id}/{capsule.split('?')[0]}"


def main(html_path: Path) -> None:
    text = html_path.read_text(encoding="utf-8")
    rows: list[dict[str, object]] = []
    excluded: list[tuple[int, str]] = []
    seen: set[int] = set()

    for match in ROW_RE.finditer(text):
        app_id = int(match.group("appid"))
        name = html_lib.unescape(match.group("name")).strip()
        players = int(match.group("players"))
        capsule = match.group("capsule")

        if app_id in seen:
            continue
        seen.add(app_id)

        if app_id in EXCLUDE_APP_IDS:
            excluded.append((app_id, name))
            continue

        source_rank = len(seen)  # 1-based chart position among unique appIds
        rows.append(
            {
                "rank": 0,  # filled after filter
                "sourceRank": source_rank,
                "steamAppId": app_id,
                "name": name,
                "coverUrl": cover_url(str(app_id), capsule),
                "currentPlayers": players,
            }
        )

    for i, row in enumerate(rows, 1):
        row["rank"] = i

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["rank", "sourceRank", "steamAppId", "name", "coverUrl", "currentPlayers"],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"wrote {len(rows)} games -> {OUT.relative_to(REPO)}")
    print(f"excluded {len(excluded)} non-games:")
    for app_id, name in excluded:
        print(f"  {app_id:>8}  {name}")


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_HTML
    if not path.exists():
        raise SystemExit(f"HTML not found: {path}")
    main(path)
