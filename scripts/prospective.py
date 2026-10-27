#!/usr/bin/env python3
"""Save immutable pre-kickoff public-sports forecasts as a GitHub Actions artifact.

No bookmaker accounts, private data, live feeds, personal profile or API secrets.
Snapshots use ONLY results dated strictly earlier than the fixture's date.
Only future calendar days are included, making pre-kickoff proof conservative.
"""
import csv
import datetime as dt
import hashlib
import json
import os
import pathlib
import sys
from zoneinfo import ZoneInfo
from backtest import model, PRIMARY, MIN_HOME, MIN_AWAY

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
OUT = ROOT / "proof" / "prospective.json"

def load_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def generate(today=None):
    now = dt.datetime.now(dt.timezone.utc)
    today = today or now.astimezone(ZoneInfo("Europe/Warsaw")).date()
    status = json.loads((DATA / "status.json").read_text(encoding="utf-8"))
    fresh_time = dt.datetime.fromisoformat(status["retrieved_at_utc"].replace("Z","+00:00"))
    fresh = 0 <= (now-fresh_time).total_seconds() <= 48*3600
    report = {
        "schema": 1,
        "created_utc": now.isoformat(timespec="seconds"),
        "as_of_date_warsaw": today.isoformat(),
        "model_version": "EDGE-LAB-v0.3.1-Poisson-no-refit",
        "source_retrieved_at_utc": status["retrieved_at_utc"],
        "source": "open-matchday",
        "github_run_id": os.getenv("GITHUB_RUN_ID", "local"),
        "github_sha": os.getenv("GITHUB_SHA", "local"),
        "status": "ready" if fresh else "stale_source",
        "leagues": 0,
        "upcoming": 0,
        "eligible": 0,
        "candidates": [],
        "notice": "Forecasts are not calibrated and cannot establish betting value."
    }
    for league in status.get("leagues",[]):
        slug=league.get("id","")
        if not slug.replace("-","").replace("_","").isalnum():
            continue
        home=DATA / slug
        try:
            results=load_csv(home / "results_2627.csv")
            fixtures=load_csv(home / "fixtures_2627.csv")
        except (FileNotFoundError,OSError):
            continue
        past=[]
        for r in results:
            try:
                game_date=dt.date.fromisoformat(r["date"])
                hg=int(r["ft_home"]);ag=int(r["ft_away"])
                if not (0 <= hg <= 14 and 0 <= ag <= 14):
                    continue
                past.append({"date":game_date, "home":r["home"],"away":r["away"],"hs":hg,"as":ag})
            except (KeyError,ValueError):
                continue
        past.sort(key=lambda r:r["date"])
        report["leagues"]+=1
        for f in fixtures:
            try:
                match_date=dt.date.fromisoformat(f["date"])
                if not (today < match_date <= today + dt.timedelta(days=8)):
                    continue
                match={"date":match_date,"home":f["home"],"away":f["away"]}
                if not match["home"] or not match["away"]:
                    continue
                report["upcoming"]+=1
                history=[r for r in past if r["date"]<match_date]
                p=model(match, history)
                if not p:
                    continue
                report["eligible"]+=1
                if not fresh:
                    continue
                # Same 4-market selection definition as the live radar.
                chosen=sorted(PRIMARY,key=lambda market:(-abs(p[market]-.5),PRIMARY.index(market)))[0]
                report["candidates"].append({
                    "league":league["name"],"fixture_date":match_date.isoformat(),
                    "home":match["home"],"away":match["away"],
                    "chosen_market":chosen, "predicted_probability":round(p[chosen],6),
                    "goal_markets":{k:round(p[k],6) for k in PRIMARY},
                    "data_cutoff_exclusive":match_date.isoformat(),
                    "model_available_on":today.isoformat(),
                })
            except (KeyError,ValueError):
                continue
    report["candidates"].sort(key=lambda x:(x["fixture_date"],x["league"],x["home"],x["away"]))
    return report

def main():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    report=generate()
    canonical=json.dumps(report,ensure_ascii=False,sort_keys=True,separators=(",",":"))
    report["snapshot_sha256"]=hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    OUT.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
    print("PROSPECTIVE",report["status"],"upcoming",report["upcoming"],"eligible",report["eligible"],
          "saved",len(report["candidates"]),"sha256",report["snapshot_sha256"][:16])
    if report["status"] != "ready":
        print("NO forecasts saved: source stale.",file=sys.stderr)

if __name__=="__main__":main()
