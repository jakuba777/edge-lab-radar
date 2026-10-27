#!/usr/bin/env python3
"""Retrospective chronological (walk-forward) audit of the shipped goals model.

Only PREVIOUS calendar dates in the same league season feed each forecast.
Data: publicly accessible football-data.co.uk full-time scores for prior seasons.
This is NOT a prospective or pre-registered validation and not betting ROI.
"""
import csv
import datetime as dt
import io
import json
import math
import pathlib
import statistics
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "data" / "backtest.json"
SOURCE = "https://www.football-data.co.uk/mmz4281/{season}/{division}.csv"
DIVISIONS = {
    "E0": "Premier League", "E1": "Championship",
    "SP1": "La Liga", "D1": "Bundesliga",
    "I1": "Serie A", "F1": "Ligue 1",
    "N1": "Eredivisie", "P1": "Primeira Liga",
}
SEASONS = ("2425", "2526")
MIN_HOME = MIN_AWAY = 4
MAX_HISTORY = 10
MAX_BYTES = 4_000_000

MARKETS = {
    "o15": lambda h, a: h + a >= 2,
    "o25": lambda h, a: h + a >= 3,
    "u35": lambda h, a: h + a <= 3,
    "btts": lambda h, a: h > 0 and a > 0,
    "hg": lambda h, a: h > 0,
    "ag": lambda h, a: a > 0,
}
PRIMARY = ("o15", "o25", "u35", "btts")

def get_csv(division, season):
    url = SOURCE.format(season=season, division=division)
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; EDGE-LAB-Research/0.4; personal research)",
        "Accept": "text/csv",
    })
    with urllib.request.urlopen(req, timeout=25) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("CSV exceeds safe limit")
    try:
        raw_text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raw_text = raw.decode("cp1252")
    reader = csv.DictReader(io.StringIO(raw_text))
    required = {"Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise ValueError("Unexpected CSV headers")
    results, deduped = [], set()
    for row in reader:
        try:
            s = (row.get("Date") or "").strip()
            date = None
            for f in ("%d/%m/%Y", "%d/%m/%y", "%d.%m.%Y", "%Y-%m-%d"):
                try:
                    date = dt.datetime.strptime(s, f).date()
                    break
                except ValueError:
                    pass
            if date is None:
                continue
            h, a = (row.get("HomeTeam") or "").strip(), (row.get("AwayTeam") or "").strip()
            hg, ag = int(row["FTHG"]), int(row["FTAG"])
            if not h or not a or h == a or not 0 <= hg <= 14 or not 0 <= ag <= 14:
                continue
            key = date.isoformat(), h, a
            if key in deduped:
                continue
            deduped.add(key)
            results.append({"date": date, "home": h, "away": a, "hs": hg, "as": ag})
        except (TypeError, ValueError, KeyError):
            continue
    results.sort(key=lambda r: (r["date"], r["home"], r["away"]))
    if len(results) < 120:
        raise ValueError(f"Insufficient valid matches ({len(results)})")
    return results

def poisson(k, rate):
    p = math.exp(-rate)
    for n in range(1, k + 1):
        p *= rate / n
    return p

def markets_from_rates(home_rate, away_rate):
    cells = [(h, a, poisson(h, home_rate) * poisson(a, away_rate))
             for h in range(13) for a in range(13)]
    norm = sum(p for _, _, p in cells)
    return {name: sum(p * int(fn(h, a)) for h, a, p in cells) / norm
            for name, fn in MARKETS.items()}

def model(match, before):
    # Exactly follows current EDGE LAB 0.3.1: do not tune this after observing test results.
    hm = [r for r in before if r["home"] == match["home"]][-MAX_HISTORY:]
    aw = [r for r in before if r["away"] == match["away"]][-MAX_HISTORY:]
    if len(hm) < MIN_HOME or len(aw) < MIN_AWAY:
        return None
    mh = max(.2, statistics.mean(r["hs"] for r in before))
    ma = max(.2, statistics.mean(r["as"] for r in before))
    mean = lambda xs, k: statistics.mean(r[k] for r in xs)
    smooth = lambda score, count, base: (score * count + base * 5) / (count + 5)
    ha = smooth(mean(hm, "hs"), len(hm), mh)
    hd = smooth(mean(hm, "as"), len(hm), ma)
    aa = smooth(mean(aw, "as"), len(aw), ma)
    ad = smooth(mean(aw, "hs"), len(aw), mh)
    lh = max(.25, min(3.7, math.sqrt(ha * ad)))
    la = max(.25, min(3.7, math.sqrt(aa * hd)))
    return markets_from_rates(lh, la)

def record(p, y, b):
    p = max(1e-9, min(1 - 1e-9, float(p)))
    b = max(1e-9, min(1 - 1e-9, float(b)))
    return {"p": p, "y": int(y), "base": b}

def metrics(samples):
    n = len(samples)
    if not n:
        return {"n": 0, "verdict": "insufficient"}
    brier = sum((s["p"] - s["y"]) ** 2 for s in samples) / n
    baseline = sum((s["base"] - s["y"]) ** 2 for s in samples) / n
    loss = -sum(s["y"] * math.log(s["p"]) + (1-s["y"]) * math.log(1-s["p"]) for s in samples) / n
    base_loss = -sum(s["y"] * math.log(s["base"]) + (1-s["y"]) * math.log(1-s["base"]) for s in samples) / n
    return {
        "n": n,
        "brier": round(brier, 5),
        "baseline_brier": round(baseline, 5),
        "delta_brier": round(brier - baseline, 5),
        "log_loss": round(loss, 5),
        "baseline_log_loss": round(base_loss, 5),
        "mean_predicted": round(sum(s["p"] for s in samples)/n, 4),
        "observed": round(sum(s["y"] for s in samples)/n, 4),
        "better_than_baseline": brier < baseline,
        "verdict": "adequate_n" if n >= 200 else "small_sample",
    }

def evaluate(rows):
    by_market = {k: [] for k in MARKETS}
    selected, counts = [], {"all": len(rows), "eligible": 0}
    # STRICT date separation: no same-day outcomes used for any forecast.
    for match in rows:
        before = [r for r in rows if r["date"] < match["date"]]
        if not before:
            continue
        predictions = model(match, before)
        if predictions is None:
            continue
        counts["eligible"] += 1
        y = {name: int(fn(match["hs"], match["as"])) for name, fn in MARKETS.items()}
        for market in MARKETS:
            # Competent rolling comparator: league-wide historical event frequency,
            # with two success and two failure pseudo-counts.
            base = (2 + sum(int(MARKETS[market](r["hs"], r["as"])) for r in before)) / (4 + len(before))
            by_market[market].append(record(predictions[market], y[market], base))
        best = sorted(PRIMARY, key=lambda k: (-abs(predictions[k] - .5), PRIMARY.index(k)))[0]
        s = by_market[best][-1]
        selected.append(s)
    return {
        "counts": counts,
        "markets": {k: metrics(v) for k, v in by_market.items()},
        "selected": metrics(selected),
        "samples": by_market,
        "chosen_samples": selected,
    }

def calibration(samples):
    bins = []
    for lo in range(0, 100, 10):
        group = [s for s in samples if lo / 100 <= s["p"] < (lo+10)/100]
        bins.append({"range": f"{lo}-{lo+10}%", "n": len(group),
                     "predicted": round(sum(s["p"] for s in group)/len(group), 4) if group else None,
                     "actual": round(sum(s["y"] for s in group)/len(group), 4) if group else None})
    return bins

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "model": "EDGE LAB 0.3.1 / Poisson shrinkage (rolling, no refit)",
        "comparison": "rolling prior league frequency with Laplace smoothing",
        "method": "retrospective walk-forward; ONLY matches from strictly earlier dates, same season, same league",
        "exclusions": "no live, no odds, no taxes/ROI; corrections to historical datasets cannot be excluded",
        "updated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "https://www.football-data.co.uk/data.php",
        "seasons": list(SEASONS), "leagues": [],
        "errors": [], "coverage": {"downloaded_seasons": 0, "eligible_matches": 0},
    }
    global_markets = {k: [] for k in MARKETS}
    global_selected = []
    for code, name in DIVISIONS.items():
        for season in SEASONS:
            try:
                rows = get_csv(code, season)
                res = evaluate(rows)
                report["leagues"].append({
                    "division": code, "league": name, "season": season,
                    "matches": res["counts"]["all"],
                    "evaluated": res["counts"]["eligible"],
                    "markets": res["markets"],
                    "selected": res["selected"],
                })
                report["coverage"]["downloaded_seasons"] += 1
                report["coverage"]["eligible_matches"] += res["counts"]["eligible"]
                for k in MARKETS:
                    global_markets[k].extend(res["samples"][k])
                global_selected.extend(res["chosen_samples"])
                print(f"{name} {season}: evaluated={res['counts']['eligible']} / {res['counts']['all']}")
            except (ValueError, urllib.error.URLError, OSError, TimeoutError, UnicodeError) as e:
                err = f"{code}/{season}: {str(e)[:180]}"
                report["errors"].append(err)
                print(f"WARN {err}", file=sys.stderr)
    report["overall"] = {k: metrics(v) for k, v in global_markets.items()}
    report["selected"] = metrics(global_selected)
    report["calibration"] = {
        market: calibration(global_markets[market])
        for market in ("o25", "btts")
    }
    n = report["coverage"]["eligible_matches"]
    report["status"] = "ready" if n >= 500 and report["coverage"]["downloaded_seasons"] >= 4 else "insufficient_data"
    if report["status"] != "ready":
        report["notice"] = "Insufficient or missing historical data: no claim of model reliability."
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("STATUS", report["status"], report["coverage"], "ERRORS", len(report["errors"]))
    if report["status"] != "ready":
        # Honest report remains available; do not fail entire app release.
        print("Report produced with insufficient data; display as unavailable", file=sys.stderr)

if __name__ == "__main__":
    main()
