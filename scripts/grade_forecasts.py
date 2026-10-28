#!/usr/bin/env python3
"""EDGE LAB scoreboard: grade immutable pre-match GitHub Actions artifacts.

Settles only matches from STRICTLY EARLIER calendar days (Europe/Warsaw).
Prevents post-hoc selection: uses earliest available authenticated, archived
forecast for each match, and earliest exact hypothetical ticket fingerprint.
No backfilled picks; no bookmaker accounts, odds or claimed profit.
Source: exact public open-matchday result rows, with conflicts withheld.

Requires GH_TOKEN with actions:read, passed via Actions environment ONLY.
"""
import csv
import datetime as dt
import io
import json
import math
import os
import pathlib
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from zoneinfo import ZoneInfo

ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/"site"/"data"
DEST=DATA/"track_record.json"
REPO="jakuba777/edge-lab-radar"
LOCAL_TZ=ZoneInfo("Europe/Warsaw")
LOOKBACK_DAYS=45
MAX_PAGES=8
PAGE_SIZE=100
MAX_ARCHIVES=650
MAX_ZIP_BYTES=2_000_000
MAX_JSON_BYTES=1_000_000
KINDS={"forecast-":"prospective.json","coupons-":"coupons.json","halftime-":"ht07_future.json"}
MARKETS=("o15","o25","u35","btts")
HTMARKETS=("2/1","1/2")
COUPON_MARKETS={"hg","ag","o15","o25","u35","btts","h2","a2","oneX","x2","home","away"}
LABELS={
 "o15":"Powyżej 1,5 gola","o25":"Powyżej 2,5 gola",
 "u35":"Poniżej 3,5 gola","btts":"Obie strzelą",
 "hg":"Gol gospodarzy","ag":"Gol gości",
 "h2":"Gospodarze 2+ gole","a2":"Goście 2+ gole",
 "oneX":"1X","x2":"X2","home":"Wygrana gospodarzy","away":"Wygrana gości",
 "2/1":"Łamak 2/1","1/2":"Łamak 1/2"
}
def date_from(s):
    try:return dt.date.fromisoformat(s)
    except (TypeError,ValueError):return None

def timestamp(s):
    try:
        val=dt.datetime.fromisoformat(str(s).replace("Z","+00:00"))
        if val.tzinfo is None:return None
        return val.astimezone(dt.timezone.utc)
    except (ValueError,TypeError):return None

def probability(p):
    try:
        v=float(p)
        return v if math.isfinite(v) and 0<v<1 else None
    except (ValueError,TypeError):return None

def result_key(league,date,home,away):
    if not all(isinstance(s,str) and len(s)>0 and len(s)<160 for s in (league,home,away)):
        return None
    if not date_from(date):return None
    return (league,date,home,away)

def actual_score(score,market):
    hg,ag,hh,ha=score
    cases={
        "o15":hg+ag>=2,"o25":hg+ag>=3,"u35":hg+ag<=3,
        "btts":hg>0 and ag>0,"hg":hg>0,"ag":ag>0,
        "h2":hg>=2,"a2":ag>=2,
        "oneX":hg>=ag,"x2":ag>=hg,"home":hg>ag,"away":ag>hg
    }
    if market in cases:return int(cases[market])
    if market in HTMARKETS:
        if hh is None or ha is None or hh>hg or ha>ag:return None
        return int((ha>hh and hg>ag) if market=="2/1" else (hh>ha and ag>hg))
    return None

def load_scores():
    status=json.loads((DATA/"status.json").read_text(encoding="utf-8"))
    scores,conflicts={},set()
    for league in status.get("leagues",[]):
        slug=league.get("id","")
        if not slug.replace("-","").replace("_","").isalnum():continue
        file=DATA/slug/"results_2627.csv"
        if not file.exists():continue
        with file.open(encoding="utf-8-sig",newline="") as fh:
            for row in csv.DictReader(fh):
                key=result_key(league.get("name",""),row.get("date"),row.get("home"),row.get("away"))
                if not key:continue
                try:
                    hg,ag=int(row["ft_home"]),int(row["ft_away"])
                    if not(0<=hg<=14 and 0<=ag<=14):continue
                except (TypeError,ValueError,KeyError):continue
                def ht(v):
                    try:
                        if v is None or v=="":return None
                        z=int(v)
                        return z if 0<=z<=14 else None
                    except (ValueError,TypeError):return None
                hh,ha=ht(row.get("ht_home")),ht(row.get("ht_away"))
                if hh is not None and hh>hg:hh=None
                if ha is not None and ha>ag:ha=None
                tup=(hg,ag,hh,ha)
                if key in scores and scores[key][:2]!=tup[:2]:
                    conflicts.add(key)
                elif key in scores and tup[:2]==scores[key][:2]:
                    prev=scores[key]
                    # Prefer valid HT fields, never invent or infer them.
                    scores[key]=(hg,ag,hh if hh is not None else prev[2],ha if ha is not None else prev[3])
                else:scores[key]=tup
    for key in conflicts:scores.pop(key,None)
    return scores,len(conflicts)

def before_day(a,b):
    date=date_from(b)
    stamp=timestamp(a)
    return bool(date and stamp and stamp.astimezone(LOCAL_TZ).date()<date)

def prior_snapshot(meta,body,first_game_date):
    """Artifact and internal timestamps must both be before the earliest kickoff date."""
    if body.get("status") not in ("ready","research_only"):return False
    if not before_day(meta.get("created_at"),first_game_date):return False
    if not before_day(body.get("created_utc"),first_game_date):return False
    if not before_day(body.get("source_retrieved_at_utc") or
                      body.get("source_timestamp"),first_game_date):return False
    return True

def read_historical_forecasts(meta,body):
    if body.get("schema")!=1:return []
    items=[]
    for raw in body.get("candidates",[])[:600]:
        key=result_key(raw.get("league"),raw.get("fixture_date"),raw.get("home"),raw.get("away"))
        market=raw.get("chosen_market")
        if not key or market not in MARKETS or not prior_snapshot(meta,body,key[1]):continue
        p=probability(raw.get("predicted_probability"))
        if p is None:continue
        other={k:probability(v) for k,v in (raw.get("goal_markets") or {}).items() if k in MARKETS}
        if len(other)!=4 or any(x is None for x in other.values()):continue
        items.append({"key":key,"market":market,"p":p,"probabilities":other,
            "created_utc":body["created_utc"],"artifact_id":meta["id"]})
    return items

def read_halftime_forecasts(meta,body):
    items=[]
    for raw in body.get("predictions",[])[:600]:
        key=result_key(raw.get("league"),raw.get("date"),raw.get("home"),raw.get("away"))
        if not key or not prior_snapshot(meta,body,key[1]):continue
        probs=raw.get("p") or {}
        if any(probability(probs.get(k)) is None for k in HTMARKETS):continue
        items.append({"key":key,"probabilities":{k:probability(probs[k]) for k in HTMARKETS},
            "created_utc":body["created_utc"],"artifact_id":meta["id"]})
    return items

def read_coupon_forecasts(meta,body):
    if body.get("schema")!=1:return []
    items=[]
    for raw in body.get("candidates",[])[:100]:
        legs=raw.get("legs")
        if not isinstance(legs,list) or not 2<=len(legs)<=4:continue
        data=[]
        for leg in legs:
            key=result_key(leg.get("league"),leg.get("date"),leg.get("home"),leg.get("away"))
            market=leg.get("market")
            p=probability(leg.get("probability"))
            if not key or market not in COUPON_MARKETS or p is None:
                data=[];break
            data.append({"key":key,"market":market,"p":p})
        if len(data)!=len(legs):continue
        earliest=min(x["key"][1] for x in data)
        if not prior_snapshot(meta,body,earliest):continue
        rid=str(raw.get("id",""))
        if len(rid)!=24 or not all(ch in "0123456789abcdef" for ch in rid):continue
        if not all(x["key"][1]!= "" for x in data):continue
        p=probability(raw.get("p_model"))
        if p is None:continue
        items.append({"id":rid,"profile":raw.get("profile"),"type":raw.get("type"),
            "legs":data,"p":p,"created_utc":body["created_utc"],"artifact_id":meta["id"]})
    return items

def outcome(key,scores,today):
    if date_from(key[1])>=today:return None,"awaiting_day"
    if key not in scores:return None,"unconfirmed_result"
    return scores[key],None

def assess_event(key,market,p,scores,today):
    score,why=outcome(key,scores,today)
    if score is None:return {"state":"pending","reason":why,"p":p,"outcome":None}
    y=actual_score(score,market)
    if y is None:return {"state":"pending","reason":"missing_market_data","p":p,"outcome":None}
    return {"state":"hit" if y==1 else "miss","reason":None,"p":p,"outcome":y,
        "score":f"{score[0]}:{score[1]}"}

def summarize(rows, probability_field="p"):
    scored=[r for r in rows if r.get("state") in ("hit","miss")]
    n=len(scored);hits=sum(r["state"]=="hit" for r in scored)
    result={"scored":n,"hit":hits,"miss":n-hits,"pending":sum(r["state"]=="pending" for r in rows),
        "hit_rate":round(hits/n,5) if n else None}
    if probability_field and n:
        values=[(r[probability_field]-r["outcome"])**2 for r in scored if r.get(probability_field) is not None and r.get("outcome") is not None]
        result["brier"]=round(sum(values)/len(values),6) if values else None
    return result

def grade(forecasts,halftimes,coupons,scores,today):
    main=[];markets=defaultdict(list);ht_rows=defaultdict(list);ticket_rows=[]
    for raw in forecasts:
        key=raw["key"]
        event=assess_event(key,raw["market"],raw["p"],scores,today)
        main.append({"date":key[1],"league":key[0],"home":key[2],"away":key[3],
            "market":raw["market"],"label":LABELS[raw["market"]],
            "snapshot_utc":raw["created_utc"],**event})
        for kind,p in raw["probabilities"].items():
            markets[kind].append(assess_event(key,kind,p,scores,today))
    for raw in halftimes:
        for kind,p in raw["probabilities"].items():
            event=assess_event(raw["key"],kind,p,scores,today)
            ht_rows[kind].append({"date":raw["key"][1],"league":raw["key"][0],
                "home":raw["key"][2],"away":raw["key"][3],"market":kind,
                "snapshot_utc":raw["created_utc"],**event})
    for raw in coupons:
        legs=[]
        for leg in raw["legs"]:
            evaluated=assess_event(leg["key"],leg["market"],leg["p"],scores,today)
            legs.append({"date":leg["key"][1],"league":leg["key"][0],
                "home":leg["key"][2],"away":leg["key"][3],
                "market":leg["market"],"label":LABELS[leg["market"]],**evaluated})
        # Ticket is lost immediately if any leg misses; hit if ALL legs hit.
        if any(l["state"]=="miss" for l in legs):state="miss";y=0
        elif all(l["state"]=="hit" for l in legs):state="hit";y=1
        else:state="pending";y=None
        ticket_rows.append({"id":raw["id"],"date":min(l["date"] for l in legs),
            "profile":raw["profile"],"type":raw["type"],"snapshot_utc":raw["created_utc"],
            "state":state,"outcome":y,"p":raw["p"],"legs":legs})
    main.sort(key=lambda r:(r["date"],r["league"],r["home"]),reverse=True)
    ticket_rows.sort(key=lambda r:(r["date"],r["profile"],r["id"]),reverse=True)
    hlist=sorted([x for rows in ht_rows.values() for x in rows],
                 key=lambda r:(r["date"],r["league"]),reverse=True)
    # Keep recently settled events visible even when many future forecasts exist.
    display=lambda rows:([x for x in rows if x["state"]!="pending"][:75]+
                         [x for x in rows if x["state"]=="pending"][:30])
    return {
        "summary":{
            "main":summarize(main),
            "market_probabilities":{m:summarize(markets[m]) for m in MARKETS},
            "halftime_research":{m:summarize(ht_rows[m]) for m in HTMARKETS},
            "simulated_coupons":summarize(ticket_rows)
        },
        "entries":{
            "main":display(main),
            "halftime_research":display(hlist),
            "simulated_coupons":display(ticket_rows)
        },
        "counts":{"forecast_matches":len(forecasts),"halftime_matches":len(halftimes),
                  "simulated_coupons":len(coupons)}
    }

def json_get(url,token):
    req=urllib.request.Request(url,headers={
        "Authorization":"Bearer "+token,
        "Accept":"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28",
        "User-Agent":"EDGE-LAB-scoreboard/0.9"})
    with urllib.request.urlopen(req,timeout=22) as response:
        buf=response.read(2_000_001)
    if len(buf)>2_000_000:raise ValueError("API response too large")
    return json.loads(buf)

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if urllib.parse.urlparse(newurl).scheme!="https":
            raise ValueError("Insecure artifact redirect")
        other=super().redirect_request(req,fp,code,msg,headers,newurl)
        if other:
            other.remove_header("Authorization")
            other.remove_header("X-GitHub-Api-Version")
        return other

def artifact_get(id,token,target):
    url=f"https://api.github.com/repos/{REPO}/actions/artifacts/{id}/zip"
    req=urllib.request.Request(url,headers={"Authorization":"Bearer "+token,
        "Accept":"application/vnd.github+json","User-Agent":"EDGE-LAB-scoreboard/0.9"})
    opener=urllib.request.build_opener(SafeRedirect())
    with opener.open(req,timeout=30) as response:
        data=response.read(MAX_ZIP_BYTES+1)
    if len(data)>MAX_ZIP_BYTES:raise ValueError("Archive exceeds size limit")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        files=[n for n in archive.namelist() if n.split("/")[-1]==target]
        if len(files)!=1:raise ValueError("Incorrect artifact structure")
        info=archive.getinfo(files[0])
        if info.file_size>MAX_JSON_BYTES:raise ValueError("JSON exceeds size limit")
        return json.loads(archive.read(files[0]))

def fetch_artifacts(token,now):
    out=[];cutoff=now-dt.timedelta(days=LOOKBACK_DAYS)
    for page in range(1,MAX_PAGES+1):
        url=f"https://api.github.com/repos/{REPO}/actions/artifacts?per_page={PAGE_SIZE}&page={page}"
        body=json_get(url,token)
        rows=body.get("artifacts",[])
        if not rows:break
        for a in rows:
            created=timestamp(a.get("created_at"))
            if not created or created<cutoff or a.get("expired"):continue
            name=a.get("name","")
            kind=next((v for p,v in KINDS.items() if name.startswith(p)),None)
            if kind:out.append((a,kind))
        # Stop once the page includes artifacts older than the cutoff.
        stamps=[timestamp(a.get("created_at")) for a in rows]
        if stamps and all(s is not None for s in stamps) and min(stamps)<cutoff:break
    out.sort(key=lambda x:(x[0]["created_at"],x[0]["id"]))
    return out[-MAX_ARCHIVES:]

def earliest_per_key(data,key_fn):
    chosen={}
    for x in sorted(data,key=lambda a:(a["created_utc"],a["artifact_id"])):
        key=key_fn(x)
        if key not in chosen:chosen[key]=x
    return list(chosen.values())

def main():
    now=dt.datetime.now(dt.timezone.utc)
    token=os.environ.get("GH_TOKEN","").strip()
    if not token:raise SystemExit("GH_TOKEN missing: cannot verify immutable archived forecasts")
    all_artifacts=fetch_artifacts(token,now)
    raw_forecasts=[];raw_ht=[];raw_coupons=[];faults=[]
    for meta,kind in all_artifacts:
        try:
            obj=artifact_get(meta["id"],token,kind)
            if kind=="prospective.json":raw_forecasts.extend(read_historical_forecasts(meta,obj))
            elif kind=="ht07_future.json":raw_ht.extend(read_halftime_forecasts(meta,obj))
            elif kind=="coupons.json":raw_coupons.extend(read_coupon_forecasts(meta,obj))
        except (OSError,ValueError,KeyError,TypeError,zipfile.BadZipFile,
                urllib.error.URLError,json.JSONDecodeError) as exc:
            faults.append({"artifact_id":meta["id"],"type":kind,"error":str(exc)[:110]})
    forecasts=earliest_per_key(raw_forecasts,lambda x:x["key"])
    halftime=earliest_per_key(raw_ht,lambda x:x["key"])
    coupons=earliest_per_key(raw_coupons,lambda x:x["id"])
    scores,conflicts=load_scores()
    today=now.astimezone(LOCAL_TZ).date()
    result=grade(forecasts,halftime,coupons,scores,today)
    result.update({
        "schema":1,"updated_utc":now.isoformat(timespec="seconds"),"status":"ready",
        "settle_only_dates_before_warsaw":today.isoformat(),
        "mode":"immutable_pre_match_archive_only",
        "provenance":"github.com/jakuba777/edge-lab-radar/actions (retained artifacts)",
        "artifacts_checked":len(all_artifacts),"artifact_errors":len(faults),
        "errors_sample":faults[:6],"conflicting_results":conflicts,
        "source_window_days":LOOKBACK_DAYS,
        "limitation":"Only forecasts found in available GitHub Actions artifacts; artifacts expire. No bet placement, no odds, no monetary P/L. Coupon simulations are not evidence of purchased tickets. All snapshots of same match are dependent."
    })
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding="utf-8")
    print("TRACK RECORD "+json.dumps({
        "artifacts":len(all_artifacts),"errors":len(faults),
        "forecasts":len(forecasts),"ht_forecasts":len(halftime),
        "coupons":len(coupons),"main":result["summary"]["main"],
        "tickets":result["summary"]["simulated_coupons"],
        "conflicts":conflicts},ensure_ascii=False))
    # Fail closed if GitHub API returns none despite forecasts being expected.
    if not all_artifacts:
        raise SystemExit("No historical artifacts found; refusing empty tracking result")
    if len(faults)>max(4,len(all_artifacts)//4):
        raise SystemExit("Too many unreadable archives; refusing incomplete tracking result")

if __name__=="__main__":main()
