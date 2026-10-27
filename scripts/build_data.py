#!/usr/bin/env python3
"""Mirror public CSV with strict paths and schema. No secrets or user data."""
import csv
import io
import json
import pathlib
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data"
LEAGUES = {
    "ENG_1_premier-league": "Premier League",
    "ENG_2_championship": "Championship",
    "ESP_1_la-liga": "La Liga",
    "GER_1_bundesliga": "Bundesliga",
    "ITA_1_serie-a": "Serie A",
    "FRA_1_ligue-1": "Ligue 1",
    "NED_1_eredivisie": "Eredivisie",
    "POR_1_primeira-liga": "Primeira Liga",
    "POL_1_ekstraklasa": "Ekstraklasa",
    "BEL_1_pro-league": "Belgijska Pro League",
    "SCO_1_premiership": "Scottish Premiership",
    "AUT_1_bundesliga": "Austriacka Bundesliga",
    "TUR_1_super-lig": "Turecka Süper Lig",
    "GER_2_2-bundesliga": "2. Bundesliga",
    "ESP_2_segunda-division": "Segunda División",
    "ITA_2_serie-b": "Serie B",
}
SEASON = "2627"
HEADERS = {
    "results": {"date", "home", "away", "ft_home", "ft_away"},
    "fixtures": {"date", "home", "away"},
}
MAX_BYTES = 3_500_000


def fetch(rel):
    req = urllib.request.Request(
        f"{BASE}/{rel}",
        headers={
            "User-Agent": "EDGE-LAB-Research/0.3 (personal, noncommercial)",
            "Accept": "text/csv",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as response:
        if response.status != 200:
            raise ValueError(f"HTTP {response.status}")
        content = response.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise ValueError("CSV exceeds size limit")
    return content


def validate(raw, kind):
    rows = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    if not rows.fieldnames or not HEADERS[kind].issubset(set(rows.fieldnames)):
        raise ValueError(f"Unexpected {kind} headers: {rows.fieldnames}")
    count = sum(bool(r.get("home") and r.get("away") and r.get("date")) for r in rows)
    if kind == "results" and count < 5:
        raise ValueError("Insufficient history for analysis")
    return count


def main():
    summary = {
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "https://github.com/oladeeayo/open-matchday",
        "season": SEASON,
        "leagues": [],
        "source_frequency": "upstream usually daily; not live",
    }
    for slug, name in LEAGUES.items():
        files, counts = {}, {}
        for kind in ("results", "fixtures"):
            remote = f"{slug}/{kind}_{SEASON}.csv"
            try:
                raw = fetch(remote)
                counts[kind] = validate(raw, kind)
                files[kind] = raw
            except (urllib.error.URLError, ValueError, UnicodeError, TimeoutError, OSError) as exc:
                print(f"WARNING {name}/{kind}: {str(exc)[:150]}", file=sys.stderr)
                break
        if len(files) != 2:
            continue
        dest = OUT / slug
        dest.mkdir(parents=True, exist_ok=True)
        for kind, raw in files.items():
            (dest / f"{kind}_{SEASON}.csv").write_bytes(raw)
        summary["leagues"].append({"id": slug, "name": name, "results": counts["results"], "fixtures": counts["fixtures"]})
        print(f"OK: {name}: {counts}")
    if len(summary["leagues"]) < 2:
        sys.exit("ERROR: fewer than two validated leagues; deployment cancelled")
    (OUT / "status.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Validated {len(summary['leagues'])} leagues")


if __name__ == "__main__":
    main()
