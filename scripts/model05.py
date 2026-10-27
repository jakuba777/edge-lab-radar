#!/usr/bin/env python3
"""EDGE LAB 0.5 controlled experiment: Poisson v0.4 vs time-decayed Dixon-Coles.

Fixed BEFORE test evaluation:
 TRAIN 2024/25: pick (half_life_days, rho) using exact-score log-loss.
 HOLDOUT 2025/26: compare models & rolling league-frequency baseline.
 Only dates STRICTLY before a match may enter its forecast; no same-day scores.
 Avoid odds, EV or profitable-bet claims. Public scores only, stdlib.
"""
import csv
import datetime as dt
import hashlib
import json
import math
import os
import pathlib
import statistics
import sys
from zoneinfo import ZoneInfo
import backtest

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "data" / "model05.json"
LIVE = ROOT / "site" / "data" / "model05_future.json"
MIN_HOME = MIN_AWAY = 4
LAST_MATCHES = 14
SMOOTH = 5.0
HALF_LIVES = (75, 120, 180)
RHOS = (-.12, -.06, 0.0, .03)
MARKETS = backtest.MARKETS
PRIMARY = backtest.PRIMARY

def avg(rows, field):
    return sum(r[field] for r in rows)/len(rows)

def weighted_mean(rows, field, on_date, half_life):
    w = [2 ** (-(on_date - r["date"]).days / half_life) for r in rows]
    # Normalize total to actual sample size so fixed shrinkage is comparable.
    sw = sum(w)
    return sum(r[field]*q for r,q in zip(rows,w))/sw

def rates(match, history, half_life=None):
    # The caller can pass unfiltered history; this function still rejects future dates.
    before = [r for r in history if r["date"] < match["date"]]
    if not before:
        return None
    if half_life is None:
        # Exactly v0.4: last 10 home/away and unchanged shrinkage to league mean.
        home = [r for r in before if r["home"] == match["home"]][-10:]
        away = [r for r in before if r["away"] == match["away"]][-10:]
    else:
        home = [r for r in before if r["home"] == match["home"]][-LAST_MATCHES:]
        away = [r for r in before if r["away"] == match["away"]][-LAST_MATCHES:]
    if len(home) < MIN_HOME or len(away) < MIN_AWAY:
        return None
    bh, ba = max(.2,avg(before,"hs")), max(.2,avg(before,"as"))
    def mu(rows, key):
        return avg(rows,key) if half_life is None else weighted_mean(rows,key,match["date"],half_life)
    def smooth(rows,key,baseline):
        return (mu(rows,key)*len(rows)+baseline*SMOOTH)/(len(rows)+SMOOTH)
    ha=smooth(home,"hs",bh)
    hd=smooth(home,"as",ba)
    aa=smooth(away,"as",ba)
    ad=smooth(away,"hs",bh)
    home_rate=max(.25,min(3.7,math.sqrt(ha*ad)))
    away_rate=max(.25,min(3.7,math.sqrt(aa*hd)))
    return home_rate,away_rate

def dc_tau(h,a,lh,la,rho):
    if h==0 and a==0: return 1-lh*la*rho
    if h==0 and a==1: return 1+lh*rho
    if h==1 and a==0: return 1+la*rho
    if h==1 and a==1: return 1-rho
    return 1.0

def score_nll(match, pair, rho=0.0):
    h,a=match["hs"],match["as"]
    lh,la=pair
    tau=dc_tau(h,a,lh,la,rho)
    if tau<=0: return 1e9
    return lh+la-h*math.log(lh)-a*math.log(la)+math.lgamma(h+1)+math.lgamma(a+1)-math.log(tau)

def market_probs(pair, rho=0.0):
    lh,la=pair
    # For normal Poisson, preserve exact existing model/truncation implementation.
    values=backtest.markets_from_rates(lh,la)
    if rho==0: return values
    # Dixon-Coles adjusts ONLY 0:0, 0:1, 1:0, 1:1.
    # Use full truncated score grid, renormalizing to avoid approximation artifacts.
    adjusted={}
    grid=[]
    denom=0.0
    for h in range(13):
        ph=backtest.poisson(h,lh)
        for a in range(13):
            p=ph*backtest.poisson(a,la)*dc_tau(h,a,lh,la,rho)
            if p<0: raise ValueError("Invalid rho for predicted goal rates")
            grid.append((h,a,p));denom+=p
    for name,fn in MARKETS.items():
        adjusted[name]=sum(p for h,a,p in grid if fn(h,a))/denom
    return adjusted

def rolling_frequency(before, name):
    return (2+sum(int(MARKETS[name](r["hs"],r["as"])) for r in before))/(4+len(before))

def snapshots(rows):
    """Precompute all games eligible for v0.4, grouped by strictly earlier dates."""
    result=[]
    for m in rows:
        prior=[r for r in rows if r["date"]<m["date"]]
        classic=rates(m,prior,None)
        if classic is None:continue
        result.append((m,prior,classic,{d:rates(m,prior,d) for d in HALF_LIVES}))
    return result

def train(seasons):
    # No holdout scores enter this optimizer.
    candidates=[(d,r) for d in HALF_LIVES for r in RHOS]
    loss={k:0.0 for k in candidates}
    n={k:0 for k in candidates}
    for rows in seasons:
        for m,prior,old,variants in snapshots(rows):
            for key in candidates:
                d,rho=key
                pair=variants[d]
                if pair is None:continue
                loss[key]+=score_nll(m,pair,rho)
                n[key]+=1
    ranked=sorted(((loss[k]/n[k],k,n[k]) for k in candidates if n[k]>=400),key=lambda t:(t[0],t[1]))
    if not ranked:raise ValueError("Insufficient training observations")
    best=ranked[0]
    return best[1], [{"half_life_days":k[0],"rho":k[1],"train_n":count,"train_score_logloss":round(value,6)}
                     for value,k,count in ranked]

def metrics(samples):
    if not samples:return {"n":0}
    n=len(samples)
    out={"n":n}
    for name in ("old","new","baseline"):
        out[name+"_brier"]=round(sum((s[name]-s["y"])**2 for s in samples)/n,6)
        out[name+"_logloss"]=round(-sum(s["y"]*math.log(max(1e-9,s[name]))+
                       (1-s["y"])*math.log(max(1e-9,1-s[name])) for s in samples)/n,6)
    diff=[(s["new"]-s["y"])**2-(s["old"]-s["y"])**2 for s in samples]
    avg_diff=sum(diff)/n
    # Naive SE is descriptive only: fixture observations are dependent in time.
    se=statistics.stdev(diff)/math.sqrt(n) if n>=2 else 0
    out["delta_new_minus_old"]=round(avg_diff,6)
    out["descriptive_95pct_interval"]=[round(avg_diff-1.96*se,6),round(avg_diff+1.96*se,6)]
    out["improved"]=avg_diff<0
    out["observed_event_rate"]=round(sum(s["y"] for s in samples)/n,4)
    return out

def compare_holdout(seasons, chosen):
    market_rows={name:[] for name in MARKETS}
    select_rows=[]
    leagues=[]
    chosen_hl,rho=chosen
    total=0
    for league,rows in seasons:
        in_market={name:[] for name in MARKETS}
        for m,before,classic,variants in snapshots(rows):
            variant=variants[chosen_hl]
            if variant is None:continue
            total+=1
            oldp=market_probs(classic,0)
            newp=market_probs(variant,rho)
            for name,fn in MARKETS.items():
                y=int(fn(m["hs"],m["as"]))
                item={"y":y,"old":oldp[name],"new":newp[name],
                      "baseline":rolling_frequency(before,name)}
                market_rows[name].append(item)
                in_market[name].append(item)
            # Same 4 markets, one index for BOTH models (no hindsight selection).
            choice=sorted(PRIMARY,key=lambda k:(-abs(oldp[k]-.5),PRIMARY.index(k)))[0]
            select_rows.append(market_rows[choice][-1])
        leagues.append({"league":league,"n":len(in_market["o15"]),
            "markets":{name:metrics(in_market[name]) for name in MARKETS}})
    combined={"markets":{name:metrics(x) for name,x in market_rows.items()},
              "selected":metrics(select_rows),"leagues":leagues}
    # Strict, predeclared gate; must also beat league frequency, not just old Poisson.
    main=("o15","o25","u35","btts","hg","ag")
    better=sum(combined["markets"][k].get("improved",False) for k in main)
    selected=combined["selected"]
    combined["decision"]={
        "better_market_count":better,
        "required_better_markets":4,
        "better_selected":selected.get("new_brier",1)<selected.get("old_brier",0),
        "beats_simple_baseline":selected.get("new_brier",1)<selected.get("baseline_brier",0),
        "eligible_for_promotion":bool(better>=4 and selected.get("new_brier",1)<selected.get("old_brier",0)
                                    and selected.get("new_brier",1)<selected.get("baseline_brier",0)),
    }
    return combined

def current_forecasts(chosen, now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    today=now.astimezone(ZoneInfo("Europe/Warsaw")).date()
    status=json.loads((ROOT/"site/data/status.json").read_text(encoding="utf-8"))
    stamp=dt.datetime.fromisoformat(status["retrieved_at_utc"].replace("Z","+00:00"))
    fresh=0<=(now-stamp).total_seconds()<=48*3600
    result={"created_utc":now.isoformat(timespec="seconds"),"as_of_warsaw":today.isoformat(),
        "model":"Dixon-Coles + decay; research only","half_life_days":chosen[0],"rho":chosen[1],
        "source":status.get("source"),"source_retrieved_at_utc":status["retrieved_at_utc"],
        "status":"ready" if fresh else "stale_source","predictions":[]}
    if not fresh:return result
    for league in status.get("leagues",[]):
        slug=league.get("id","")
        if not slug.replace("_","").replace("-","").isalnum():continue
        prefix=ROOT/"site/data"/slug
        try:
            with (prefix/"results_2627.csv").open(encoding="utf-8-sig",newline="") as file:
                data=list(csv.DictReader(file))
            with (prefix/"fixtures_2627.csv").open(encoding="utf-8-sig",newline="") as file:
                fixtures=list(csv.DictReader(file))
        except (OSError,ValueError):continue
        history=[]
        for r in data:
            try:
                d=dt.date.fromisoformat(r["date"])
                a,b=int(r["ft_home"]),int(r["ft_away"])
                if 0<=a<=14 and 0<=b<=14 and r["home"] and r["away"]:
                    history.append({"date":d,"home":r["home"],"away":r["away"],"hs":a,"as":b})
            except (KeyError,ValueError):pass
        history.sort(key=lambda x:x["date"])
        for f in fixtures:
            try:
                day=dt.date.fromisoformat(f["date"])
                if not today<day<=today+dt.timedelta(days=8):continue
                game={"date":day,"home":f["home"],"away":f["away"]}
                old=rates(game,history,None);new=rates(game,history,chosen[0])
                if not old or not new:continue
                pold=market_probs(old);pnew=market_probs(new,chosen[1])
                result["predictions"].append({
                    "league":league["name"],"date":day.isoformat(),
                    "home":game["home"],"away":game["away"],
                    "p_old":{k:round(v,5) for k,v in pold.items()},
                    "p_new":{k:round(v,5) for k,v in pnew.items()},
                    "cutoff_exclusive":day.isoformat()
                })
            except (ValueError,KeyError):continue
    result["predictions"].sort(key=lambda x:(x["date"],x["league"],x["home"],x["away"]))
    return result

def main():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    datasets={"2425":[],"2526":[]}
    errors=[]
    for slug,label in backtest.DIVISIONS.items():
        for season in ("2425","2526"):
            try:
                rows=backtest.get_csv(slug,season)
                datasets[season].append((label,rows))
                print("DATA",slug,season,len(rows))
            except (ValueError,OSError,TimeoutError) as exc:
                errors.append(f"{slug}/{season}: {str(exc)[:130]}")
                print("WARN",errors[-1],file=sys.stderr)
    if len(datasets["2425"])<6 or len(datasets["2526"])<6:
        raise SystemExit("Insufficient season coverage for fair comparison")
    # Keep identical league cohorts in both seasons.
    cohort={label for label,_ in datasets["2425"]} & {label for label,_ in datasets["2526"]}
    if len(cohort)<6:raise SystemExit("Too few matched leagues")
    training=[rows for label,rows in datasets["2425"] if label in cohort]
    holdout=[(label,rows) for label,rows in datasets["2526"] if label in cohort]
    selected,ranking=train(training)
    tested=compare_holdout(holdout,selected)
    report={"schema":1,"experiment":"0.5 experimental, does not replace radar v0.4",
        "trained_on":"2024/25 only","holdout":"2025/26 only, not used in parameter selection",
        "method":"time-decayed smoothed home/away Poisson intensities + Dixon-Coles low-score correction",
        "coverage":{"league_pairs":len(cohort),"test_matches":tested["selected"]["n"]},
        "training_grid":ranking,"selected_parameters":{"half_life_days":selected[0],"rho":selected[1]},
        "holdout":tested,"errors":errors,
        "limitations":"retrospective corrected CSV, uncalibrated; no odds/EV/ROI, no prospective validation",
        "created_utc":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "status":"ready" if tested["selected"]["n"]>=1000 else "insufficient"}
    if report["status"]!="ready":raise SystemExit("Insufficient holdout sample")
    OUT.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
    live=current_forecasts(selected)
    LIVE.write_text(json.dumps(live,indent=2,ensure_ascii=False),encoding="utf-8")
    print("MODEL05",json.dumps({
        "trained":len(training),"holdout":tested["selected"]["n"],"params":selected,
        "selected":tested["selected"],"gate":tested["decision"],
        "prospective":len(live["predictions"]),"live_status":live["status"]},ensure_ascii=False))

if __name__=="__main__":main()
