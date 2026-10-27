#!/usr/bin/env python3
"""EDGE LAB: factual HT/FT source coverage audit. This is NOT a break-comeback predictor."""
import csv
import datetime as dt
import json
import pathlib
from build_data import OUT

SUMMARY = OUT / "ht_coverage.json"
NEEDED = ("date","home","away","ft_home","ft_away","ht_home","ht_away")
MIN_COUNT = 45
MIN_COVERAGE = .70

def parse_score(s):
    if s is None or str(s).strip()=="":
        return None
    try:
        number=int(str(s).strip())
    except (ValueError, TypeError):
        return None
    return number if 0<=number<=15 else None

def inspect_rows(rows):
    valid_total=0
    complete=0
    first_to_second=0
    second_to_first=0
    second_half_goals=0
    ht_home_lead=ht_away_lead=0
    for row in rows:
        ft_h=parse_score(row.get("ft_home"))
        ft_a=parse_score(row.get("ft_away"))
        if not row.get("home") or not row.get("away") or ft_h is None or ft_a is None:
            continue
        valid_total+=1
        ht_h=parse_score(row.get("ht_home"))
        ht_a=parse_score(row.get("ht_away"))
        if ht_h is None or ht_a is None or ht_h>ft_h or ht_a>ft_a:
            continue
        complete+=1
        ht_home_lead+=int(ht_h>ht_a)
        ht_away_lead+=int(ht_a>ht_h)
        # HT/FT "2/1": away leads at HT, home wins at FT.
        second_to_first+=int(ht_a>ht_h and ft_h>ft_a)
        # HT/FT "1/2": home leads at HT, away wins at FT.
        first_to_second+=int(ht_h>ht_a and ft_a>ft_h)
        second_half_goals+=(ft_h-ht_h)+(ft_a-ht_a)
    coverage=complete/valid_total if valid_total else 0
    reliable=complete>=MIN_COUNT and coverage>=MIN_COVERAGE
    return {
        "matches_with_results":valid_total,
        "matches_with_valid_htft":complete,
        "htft_coverage":round(coverage,4),
        "usable_for_research":reliable,
        "reversal_2_1":second_to_first if reliable else None,
        "reversal_1_2":first_to_second if reliable else None,
        "reversal_total":first_to_second+second_to_first if reliable else None,
        "away_lead_at_ht":ht_away_lead if reliable else None,
        "home_lead_at_ht":ht_home_lead if reliable else None,
        "average_second_half_goals":round(second_half_goals/complete,3) if reliable else None,
        "notice":"Observed frequency only; no calibrated forecast or odds."
    }

def main():
    status=json.loads((OUT/"status.json").read_text(encoding="utf-8"))
    summary={
        "created_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source":"open-matchday, 2026/27 results CSV",
        "requirements":{"minimum_valid_matches":MIN_COUNT,"minimum_coverage":MIN_COVERAGE},
        "warning":"HT/FT past rates are not predictions; never use missing fields as zero.",
        "leagues":[],
    }
    for league in status.get("leagues",[]):
        name=league.get("id","")
        if not name.replace("_","").replace("-","").isalnum():
            continue
        f=OUT/name/"results_2627.csv"
        with f.open(encoding="utf-8-sig",newline="") as file:
            rows=list(csv.DictReader(file))
        metrics=inspect_rows(rows)
        summary["leagues"].append({"id":name,"name":league["name"],**metrics})
        print("HT COVERAGE",name,metrics["matches_with_valid_htft"],"/",metrics["matches_with_results"],
            "usable",metrics["usable_for_research"])
    summary["leagues_with_usable_htft"]=sum(l["usable_for_research"] for l in summary["leagues"])
    SUMMARY.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    print("HT COVERAGE usable",summary["leagues_with_usable_htft"],"of",len(summary["leagues"]))

if __name__=="__main__":main()
