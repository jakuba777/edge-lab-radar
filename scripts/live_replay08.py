#!/usr/bin/env python3
"""EDGE LAB 0.8: observed-goals match replay, NOT a real-time data service.

Uses only reconciled historical match goal minutes from the existing,
public open-matchday 2026/27 mirror. Restricts output to verified complete
events, no missing-minute imputation and no team attribution guesses.

Forecast: at 45', 60', 75', probability at least one goal in NEXT 15'.
Baseline is the historical same-league, same-window frequency from STRICTLY
EARLIER DATES. Experimental variant conditions on goals in previous 15 minutes
with 24 pseudo-observations of baseline smoothing; preset, no test tuning.
Oct 2026+ retrospective walk-forward; no actual odds, xG or profit estimates.
"""
import csv
import datetime as dt
import json
import math
import pathlib
import re
import statistics
from zoneinfo import ZoneInfo

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/"site"/"data"
OUT=DATA/"live08_replay.json"
WINDOWS=(45,60,75)
HORIZON=15
MIN_BASE=15
SMOOTH=24
TEST_START=dt.date(2026,10,1)
MIN_TEST_MATCHES=500
MIN_TEST_EVENTS=20
MIN_TEST_OBSERVATIONS=1000
MAX_DISPLAY=60
_TOKEN=re.compile(r"^(\d{1,3})(?:\+(\d{1,2}))?$")

def minute_token(token):
    """Accept minute tokens, including 45+2 and 90+4; do not fabricate timings."""
    s=str(token).strip().replace("’","").replace("'","")
    if not s:return None
    m=_TOKEN.fullmatch(s)
    if not m:return None
    base=int(m.group(1));extra=int(m.group(2) or "0")
    if base<1 or base>120 or extra>20:return None
    value=base+extra
    if value>120:return None
    return value

def minutes_from_text(s,ft_home,ft_away,half_home=None,half_away=None):
    """Reject incomplete feeds; 0-0 with empty goal minute list is valid."""
    if s is None:return None
    raw=str(s).strip()
    tokens=[t.strip() for t in raw.split(",") if t.strip()] if raw else []
    if len(tokens)!=ft_home+ft_away:return None
    minutes=[minute_token(t) for t in tokens]
    if any(m is None for m in minutes):return None
    if half_home is not None and half_away is not None:
        # 45+ stoppage-time is assigned minute 46+, upstream may encode 45+ differently;
        # conservative: validate HT count only when no goal is at 45..49 minutes.
        borderline=any(45<=m<=49 for m in minutes)
        if not borderline:
            if sum(m<=45 for m in minutes)!=half_home+half_away:
                return None
    return sorted(minutes)

def _num(s):
    try:
        if s is None or s=="":return None
        k=int(s)
        return k if 0<=k<=20 else None
    except (ValueError,TypeError):return None

def load_matches(path):
    matches=[];total=0
    positive_total=0
    with path.open(encoding="utf-8-sig",newline="") as f:
        rows=csv.DictReader(f)
        cols=set(rows.fieldnames or [])
        if not {"date","home","away","ft_home","ft_away","goal_minutes"}.issubset(cols):
            raise ValueError("Source lacks goal-minute schema")
        for r in rows:
            try:
                d=dt.date.fromisoformat(r["date"])
                home=(r.get("home") or "").strip();away=(r.get("away") or "").strip()
                hg,ag=_num(r.get("ft_home")),_num(r.get("ft_away"))
                if hg is None or ag is None or not home or not away or home==away:continue
                total+=1
                positive_total+=int(hg+ag>0)
                ht_h,ht_a=_num(r.get("ht_home")),_num(r.get("ht_away"))
                if ht_h is not None and ht_h>hg:continue
                if ht_a is not None and ht_a>ag:continue
                times=minutes_from_text(r.get("goal_minutes"),hg,ag,ht_h,ht_a)
                if times is None:continue
                matches.append({"date":d,"home":home,"away":away,"minutes":times,
                                "goals":hg+ag,"halftime":(ht_h+ht_a if ht_h is not None and ht_a is not None else None)})
            except (ValueError,KeyError):continue
    matches.sort(key=lambda r:(r["date"],r["home"],r["away"]))
    return total,matches,positive_total

def prior_count(match,t):
    return sum(t-15<m<=t for m in match["minutes"])

def next_goal(match,t):
    return int(any(t<m<=t+HORIZON for m in match["minutes"]))

def forecast(t,prior,prior_goals):
    same=[r for r in prior]
    if len(same)<MIN_BASE:return None
    successes=sum(next_goal(r,t) for r in same)
    base=(2+successes)/(4+len(same)) # fixed 2/2 pseudo-counts, only past
    matched=[r for r in same if min(2,prior_count(r,t))==min(2,prior_goals)]
    count=len(matched)
    observed=sum(next_goal(r,t) for r in matched)
    experimental=(observed+SMOOTH*base)/(count+SMOOTH)
    return {
        "baseline":base,"experimental":experimental,
        "history":len(same),"matched_history":count
    }

def evaluate_one_match(match,prior):
    frames=[]
    for t in WINDOWS:
        recent=prior_count(match,t)
        fit=forecast(t,prior,recent)
        if fit is None:continue
        frames.append({
            "minute":t,"goals_so_far":sum(m<=t for m in match["minutes"]),
            "goals_last_15":recent,
            "has_goal_next_15":next_goal(match,t),
            "p_baseline":fit["baseline"],"p_replay":fit["experimental"],
            "history":fit["history"],"matched_history":fit["matched_history"]
        })
    return frames

def _metrics(samples):
    if not samples:return {"n":0,"events":0}
    n=len(samples)
    return {
        "n":n,"events":sum(x["has_goal_next_15"] for x in samples),
        "observed_rate":round(sum(x["has_goal_next_15"] for x in samples)/n,5),
        "model_mean":round(sum(x["p_replay"] for x in samples)/n,5),
        "baseline_mean":round(sum(x["p_baseline"] for x in samples)/n,5),
        "brier_replay":round(sum((x["p_replay"]-x["has_goal_next_15"])**2 for x in samples)/n,6),
        "brier_baseline":round(sum((x["p_baseline"]-x["has_goal_next_15"])**2 for x in samples)/n,6),
    }

def run(now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    status=json.loads((DATA/"status.json").read_text(encoding="utf-8"))
    result={"schema":1,"version":"EDGE LAB 0.8 · Historical minute-by-minute replay",
        "created_utc":now.isoformat(timespec="seconds"),
        "source":"open-matchday 2026/27 public CSV mirrored by existing build",
        "source_retrieved_at_utc":status.get("retrieved_at_utc"),
        "mode":"REPLAY_ONLY_NOT_LIVE",
        "windows":list(WINDOWS),"horizon_minutes":HORIZON,
        "split":"2026-10-01+ walk-forward test, strictly earlier league match dates (no same-day scores)",
        "all_leagues":[],"test_results":{},"replays":[],
        "notice":"No current scores, odds, shots or xG; no predictor proven profitable; not live. Source may omit goal minutes selectively; goal-positive coverage is audited."
    }
    all_samples=[]
    all_test_matches=0
    for league in status["leagues"]:
        file=DATA/league["id"]/"results_2627.csv"
        if not file.exists():continue
        total,valid,positive_total=load_matches(file)
        ratio=len(valid)/total if total else 0
        positive_valid=sum(m["goals"]>0 for m in valid)
        positive_coverage=positive_valid/positive_total if positive_total else 0
        if total<40 or ratio<.55 or positive_coverage<.60:
            result["all_leagues"].append({"league":league["name"],"total":total,
                "reconciled":len(valid),"coverage":round(ratio,4),
                "goal_positive_coverage":round(positive_coverage,4),"status":"not_usable"})
            continue
        evaluated=0;league_samples=[]
        for match in valid:
            prior=[r for r in valid if r["date"]<match["date"]]
            frames=evaluate_one_match(match,prior)
            if not frames:continue
            # Entire historical replay is not a before-kickoff forecast.
            # Snapshot frames contain only events <= the displayed minute.
            if match["date"]>=TEST_START and match["date"]<now.astimezone(ZoneInfo("Europe/Warsaw")).date():
                evaluated+=1
                league_samples.extend(frames)
            # Display only completed matches from past days (not today).
            if match["date"]<now.astimezone(ZoneInfo("Europe/Warsaw")).date():
                result["replays"].append({
                    "league":league["name"],"date":match["date"].isoformat(),
                    "home":match["home"],"away":match["away"],
                    "fulltime_total_goals":match["goals"],
                    "frames":[{key:(round(v,6) if isinstance(v,float) else v) for key,v in frame.items()} for frame in frames]
                })
        all_test_matches+=evaluated
        all_samples.extend(league_samples)
        result["all_leagues"].append({"league":league["name"],"total":total,
            "reconciled":len(valid),"coverage":round(ratio,4),
            "goal_positive_coverage":round(positive_coverage,4),
            "status":"usable","test_matches":evaluated,
            "test":_metrics(league_samples)})
    result["replays"].sort(key=lambda x:(x["date"],x["league"]),reverse=True)
    result["replays"]=result["replays"][:MAX_DISPLAY]
    result["test_results"]=_metrics(all_samples)
    result["test_results"]["test_matches"]=all_test_matches
    result["test_results"]["descriptive_sample_gate"]=(
        all_test_matches>=MIN_TEST_MATCHES
        and len(all_samples)>=MIN_TEST_OBSERVATIONS
        and result["test_results"].get("events",0)>=MIN_TEST_EVENTS
        and result["test_results"].get("brier_replay",1)<result["test_results"].get("brier_baseline",0)
    )
    result["test_results"]["eligible_for_strong_claim"]=False
    result["test_results"]["status"]="research_only"
    result["test_results"]["caveat"]="Observations from a match are dependent; total snapshots do not equal independent matches."
    return result

def main():
    result=run()
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print("LIVE08",json.dumps({
        "replay_leagues":sum(x["status"]=="usable" for x in result["all_leagues"]),
        "matches":result["test_results"]["test_matches"],
        "observations":result["test_results"]["n"],
        "events":result["test_results"]["events"],
        "brier_replay":result["test_results"].get("brier_replay"),
        "brier_baseline":result["test_results"].get("brier_baseline"),
        "replays":len(result["replays"]),"strong_claim":False
    },ensure_ascii=False))
if __name__=="__main__":main()
