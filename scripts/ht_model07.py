#!/usr/bin/env python3
"""EDGE LAB 0.7 - rare halftime/fulltime comeback research (2/1, 1/2).

Rights-conscious data source: open-matchday 2026/27 compilation, already
mirrored for noncommercial research. Does NOT scrape third-party archives.
Predeclared evaluation: October 2026 test games, all earlier games from
THE SAME LEAGUE/SEASON only; no same-day scores ever enter a forecast.
Estimates use independent Poisson counts for goals in each of two halves,
with home/away venue attack+opposition-concession shrinkage. Uncalibrated.
No live data, bookmaker prices, odds, EV or profitability assertions.
"""
import csv
import datetime as dt
import json
import math
import pathlib
import statistics
import sys
from zoneinfo import ZoneInfo
from ht_coverage import parse_score

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/"site"/"data"
OUT=DATA/"ht07_backtest.json"
FUTURE=DATA/"ht07_future.json"
# Fixed BEFORE evaluating October outcomes; do not optimize these on the test.
TEST_START=dt.date(2026,10,1)
MIN_LEAGUE=40
MIN_HOME=3
MIN_AWAY=3
MAX_FORM=10
PRIOR_MATCH_WEIGHT=6
RARE_PRIOR_EVENTS=1
RARE_PRIOR_MATCHES=40
MAX_GOALS_HALF=9
MARKETS={
    "2/1":lambda h1,a1,h2,a2:a1>h1 and (h1+h2)>(a1+a2),
    "1/2":lambda h1,a1,h2,a2:h1>a1 and (a1+a2)>(h1+h2)
}

def read_results(path):
    rows=[]
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        required={"date","home","away","ht_home","ht_away","ft_home","ft_away"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError("Missing required halftime or fulltime columns")
        for r in reader:
            try:
                d=dt.date.fromisoformat(r["date"])
                h1,a1,hf,af=[parse_score(r.get(k)) for k in ("ht_home","ht_away","ft_home","ft_away")]
                if (not r.get("home") or not r.get("away") or r["home"]==r["away"]
                    or any(x is None for x in (h1,a1,hf,af)) or h1>hf or a1>af):
                    continue
                rows.append({"date":d,"home":r["home"],"away":r["away"],"h1":h1,"a1":a1,
                             "h2":hf-h1,"a2":af-a1,"hf":hf,"af":af})
            except (ValueError,TypeError,KeyError):
                continue
    rows.sort(key=lambda r:(r["date"],r["home"],r["away"]))
    return rows

def read_fixtures(path):
    matches=[]
    with path.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        for r in reader:
            try:
                match={"date":dt.date.fromisoformat(r["date"]),
                       "home":r["home"].strip(),"away":r["away"].strip(),"time":(r.get("time") or "")}
                if match["home"] and match["away"] and match["home"]!=match["away"]:
                    matches.append(match)
            except (ValueError,KeyError,AttributeError):
                continue
    matches.sort(key=lambda r:(r["date"],r["home"],r["away"]))
    return matches

def poisson(k,lam):
    x=math.exp(-lam)
    for n in range(1,k+1):x*=lam/n
    return x

def difference_dist(lam_home,lam_away):
    home=[poisson(i,lam_home) for i in range(MAX_GOALS_HALF+1)]
    away=[poisson(i,lam_away) for i in range(MAX_GOALS_HALF+1)]
    probs={}
    total=0.0
    for h,ph in enumerate(home):
        for a,pa in enumerate(away):
            p=ph*pa;probs[h-a]=probs.get(h-a,0)+p;total+=p
    if total<=0:raise ValueError("Invalid Poisson distribution")
    return {d:p/total for d,p in probs.items()}

def comeback_probs(rates):
    h1,a1,h2,a2=rates
    first=difference_dist(h1,a1)
    second=difference_dist(h2,a2)
    # Half-time margin = home goals - away goals. FT margin adds second-half.
    p21=sum(p*q for margin,p in first.items() if margin<0
            for change,q in second.items() if margin+change>0)
    p12=sum(p*q for margin,p in first.items() if margin>0
            for change,q in second.items() if margin+change<0)
    return {"2/1":p21,"1/2":p12}

def rate_model(match,history):
    # Reject later results even when the caller mistakenly supplies them.
    before=[r for r in history if r["date"]<match["date"]]
    if len(before)<MIN_LEAGUE:return None
    home=[r for r in before if r["home"]==match["home"]][-MAX_FORM:]
    away=[r for r in before if r["away"]==match["away"]][-MAX_FORM:]
    if len(home)<MIN_HOME or len(away)<MIN_AWAY:return None
    def avg(rows,key):return sum(r[key] for r in rows)/len(rows)
    # League means by venue and HALF, protected against zero.
    means={k:max(.12,avg(before,k)) for k in ("h1","a1","h2","a2")}
    def sm(rows,key,baseline):
        return (sum(r[key] for r in rows)+PRIOR_MATCH_WEIGHT*baseline)/(len(rows)+PRIOR_MATCH_WEIGHT)
    # Home attack + away concession, then away attack + home concession.
    estimates=[]
    for hk,ak in (("h1","a1"),("h2","a2")):
        home_for=sm(home,hk,means[hk]);away_against=sm(away,hk,means[hk])
        away_for=sm(away,ak,means[ak]);home_against=sm(home,ak,means[ak])
        estimates.extend((min(2.7,max(.12,math.sqrt(home_for*away_against))),
                          min(2.7,max(.12,math.sqrt(away_for*home_against)))))
    probs=comeback_probs(estimates)
    return {"p":probs,"rates":estimates,"n_home":len(home),"n_away":len(away),
            "league_history":len(before)}

def event(row,kind):
    return int(MARKETS[kind](row["h1"],row["a1"],row["h2"],row["a2"]))

def rolling_frequency(prior,market):
    return (RARE_PRIOR_EVENTS+sum(event(r,market) for r in prior))/(RARE_PRIOR_MATCHES+len(prior))

def measure(samples):
    if not samples:return {"n":0}
    n=len(samples);actual=sum(y for p,b,y in samples)
    bp=sum((p-y)**2 for p,b,y in samples)/n
    bb=sum((b-y)**2 for p,b,y in samples)/n
    def ll(p,y):
        p=max(1e-8,min(1-1e-8,p))
        return -y*math.log(p)-(1-y)*math.log(1-p)
    return {
        "n":n,"events":actual,"actual_frequency":round(actual/n,5),
        "predicted_mean":round(sum(p for p,b,y in samples)/n,5),
        "baseline_mean":round(sum(b for p,b,y in samples)/n,5),
        "brier_model":round(bp,7),"brier_baseline":round(bb,7),
        "delta_brier":round(bp-bb,7),
        "logloss_model":round(sum(ll(p,y) for p,b,y in samples)/n,6),
        "logloss_baseline":round(sum(ll(b,y) for p,b,y in samples)/n,6)
    }

def backtest_by_league(league,rows):
    series={k:[] for k in MARKETS}
    evaluated=0
    for m in rows:
        if m["date"]<TEST_START:continue
        if m["date"]>=dt.datetime.now(ZoneInfo("Europe/Warsaw")).date():continue
        before=[r for r in rows if r["date"]<m["date"]]
        predicted=rate_model(m,before)
        if predicted is None:continue
        evaluated+=1
        for kind in MARKETS:
            series[kind].append((predicted["p"][kind],rolling_frequency(before,kind),event(m,kind)))
    return {"league":league,"eligible_matches":evaluated,
            "markets":{kind:measure(series[kind]) for kind in MARKETS}},series

def model_future(league,rows,fixtures,now):
    today=now.astimezone(ZoneInfo("Europe/Warsaw")).date()
    records=[]
    for m in fixtures:
        # Today excluded as no verified kickoff-time semantics from upstream.
        if not (today<m["date"]<=today+dt.timedelta(days=8)):continue
        pred=rate_model(m,rows)
        if pred is None:continue
        # Use only earlier results even when the CSV already includes postponed scores.
        records.append({"league":league,"date":m["date"].isoformat(),"time_source":m["time"],
                        "home":m["home"],"away":m["away"],"p":{k:round(v,6) for k,v in pred["p"].items()},
                        "n_home":pred["n_home"],"n_away":pred["n_away"],
                        "league_history":pred["league_history"],"exclusive_cutoff":m["date"].isoformat()})
    return records

def main():
    DATA.mkdir(parents=True,exist_ok=True)
    status=json.loads((DATA/"status.json").read_text(encoding="utf-8"))
    coverage=json.loads((DATA/"ht_coverage.json").read_text(encoding="utf-8"))
    good={l["id"] for l in coverage["leagues"] if l["usable_for_research"]}
    now=dt.datetime.now(dt.timezone.utc)
    timestamp=dt.datetime.fromisoformat(status["retrieved_at_utc"].replace("Z","+00:00"))
    fresh=0<=(now-timestamp).total_seconds()<=48*3600
    global_samples={k:[] for k in MARKETS}
    league_reports=[];future=[];errors=[]
    for l in status["leagues"]:
        if l["id"] not in good:continue
        folder=DATA/l["id"]
        try:
            rows=read_results(folder/"results_2627.csv")
            fixtures=read_fixtures(folder/"fixtures_2627.csv")
            if len(rows)<MIN_LEAGUE:continue
            report,samples=backtest_by_league(l["name"],rows)
            league_reports.append(report)
            for k in MARKETS:global_samples[k].extend(samples[k])
            if fresh:future.extend(model_future(l["name"],rows,fixtures,now))
        except (ValueError,OSError,KeyError) as e:
            errors.append(l["id"]+": "+str(e)[:150])
    by_market={k:measure(v) for k,v in global_samples.items()}
    n=by_market["2/1"]["n"]
    rare=sum(by_market[k].get("events",0) for k in MARKETS)
    sufficient=n>=500 and rare>=35 and len(league_reports)>=6
    ready=(sufficient and all(by_market[k]["brier_model"]<by_market[k]["brier_baseline"]
                              and by_market[k]["logloss_model"]<by_market[k]["logloss_baseline"]
                              for k in MARKETS))
    report={
        "schema":1,"model":"EDGE LAB 0.7: 4 independent half-goal Poissons, venue-form shrinkage",
        "status":"evaluable" if sufficient else "insufficient_data",
        "validation":"2026-10-01 onward ONLY, walk-forward; older same-season matches used for each fixture",
        "test_start":TEST_START.isoformat(),"leagues":league_reports,
        "market_results":by_market,"matches_evaluated":n,"observed_breaks":rare,
        "source":"open-matchday (noncommercial)","source_timestamp":status["retrieved_at_utc"],
        "candidate_leagues":len(good),"evaluated_leagues":len(league_reports),"errors":errors,
        "created_utc":now.isoformat(timespec="seconds"),
        "statistical_gate":{"min_holdout_matches":500,"min_observed_breaks":35,
                            "beat_baseline_brier_and_logloss_both_markets":ready,
                            "sufficient_observations":sufficient,
                            "can_replace_primary_model":False},
        "warning":"Short retrospective 2026/27 window. Rare outcomes, small event counts. No actual odds, profit or verified advantage. Never promote model automatically."
    }
    OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    future.sort(key=lambda r:(r["date"],r["league"],r["home"]))
    data={"created_utc":now.isoformat(timespec="seconds"),
          "source_timestamp":status["retrieved_at_utc"],"status":"research_only" if fresh else "stale",
          "model":"HT/FT Poisson 0.7 - uncalibrated research",
          "validation_sufficient":sufficient,"validated_predictive_edge":False,
          "predictions":future[:160],
          "note":"Research candidates only, not proven selections. High probabilities do not imply positive value. Check match identity and exact kickoff."}
    FUTURE.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
    print("HT07",json.dumps({"status":report["status"],"matches":n,
                             "events":rare,"leagues":len(league_reports),
                             "future":len(future),"quality":by_market,
                             "errors":len(errors)},ensure_ascii=False))

if __name__=="__main__":main()
