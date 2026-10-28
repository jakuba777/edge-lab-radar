#!/usr/bin/env node
/* Archive exactly what the public Coupon Core 0.6 engine proposes BEFORE dates.
   Its output is for later accountability, NOT a record of actual bets placed. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('../site/assets/coupon-core.js');
const ROOT=path.resolve(__dirname,'..');
const DATA=path.join(ROOT,'site','data');
const OUT=path.join(ROOT,'proof','coupons.json');
const now=new Date();
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const ageDays=date=>core.daysBetween(date,today);
function readCSV(p){return core.parseCSV(fs.readFileSync(p,'utf8'));}
function candidateFromLeague(l){
 const prefix=path.join(DATA,l.id);
 const rows=readCSV(path.join(prefix,'results_2627.csv'));
 const fixtures=readCSV(path.join(prefix,'fixtures_2627.csv'));
 if(!rows.length||!fixtures.length)throw Error('Missing CSV rows '+l.id);
 const history=rows.filter(r=>core.validDate(r.date)&&r.home&&r.away&&core.n(r.ft_home)!==null&&core.n(r.ft_away)!==null)
  .map(r=>({date:r.date,home:r.home,away:r.away,hs:core.n(r.ft_home),as:core.n(r.ft_away)}))
  .filter(r=>r.hs>=0&&r.as>=0&&r.hs<=14&&r.as<=14)
  .sort((a,b)=>a.date.localeCompare(b.date));
 const seen=new Set();
 return fixtures.filter(f=>core.validDate(f.date)&&f.home&&f.away&&f.home!==f.away
  &&ageDays(f.date)>=1&&ageDays(f.date)<=8).map(f=>{
   const id=[l.id,f.date,f.home,f.away].join('|');
   return {...f,id,leagueId:l.id,league:l.name,model:core.analyze(f,history)};
  }).filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return x.model;});
}
function packCoupon(c){
 const legs=c.legs.map(leg=>({
  league:leg.match.league,league_id:leg.match.leagueId,
  date:leg.match.date,home:leg.match.home,away:leg.match.away,
  market:leg.id,probability:Number(leg.p.toFixed(6))
 }));
 const code=JSON.stringify({profile:c.profile,type:c.type,legs:legs.map(l=>l.league_id+'|'+l.date+'|'+l.home+'|'+l.away+'|'+l.market).sort()});
 return {id:crypto.createHash('sha256').update(code).digest('hex').slice(0,24),
  profile:c.profile,type:c.type,legs,p_model:Number(c.p.toFixed(6)),
  warning:'Hypothetical combination only; no real bet, no bookmaker quote'};
}
function generate(){
 const status=JSON.parse(fs.readFileSync(path.join(DATA,'status.json'),'utf8'));
 const created=now.toISOString();
 const source_time=Date.parse(status.retrieved_at_utc);
 const fresh=Number.isFinite(source_time)&&(now.getTime()-source_time)>=0&&(now.getTime()-source_time)<=48*3600000;
 const result={schema:1,created_utc:created,as_of_warsaw:today,source_retrieved_at_utc:status.retrieved_at_utc,
  status:fresh?'ready':'stale_source',model:'EDGE LAB Coupon Core 0.6',version:'0.6',
  candidates:[],matches_eligible:0,errors:[],note:'Archived simulations, not placed tickets or guaranteed profit.'};
 if(!fresh)return result;
 let matches=[];
 for(const l of status.leagues){
  if(!/^[A-Za-z0-9_-]+$/.test(l.id))continue;
  try{matches.push(...candidateFromLeague(l));}catch(e){result.errors.push(l.id+': '+String(e.message).slice(0,160));}
 }
 result.matches_eligible=matches.length;
 const seen=new Set();
 for(const profile of ['selective','balanced','contrarian']){
  for(const count of [2,3,4]){
   for(const c of core.createCoupons(matches,profile,count,3)){
    const record=packCoupon(c);if(!seen.has(record.id)){seen.add(record.id);result.candidates.push(record);}
   }
  }
 }
 for(const c of core.createCoupons(matches,'builder',2,5)){
  const record=packCoupon(c);if(!seen.has(record.id)){seen.add(record.id);result.candidates.push(record);}
 }
 result.candidates.sort((a,b)=>a.profile.localeCompare(b.profile)||a.id.localeCompare(b.id));
 return result;
}
if(require.main===module){
 const result=generate();
 fs.mkdirSync(path.dirname(OUT),{recursive:true});
 fs.writeFileSync(OUT,JSON.stringify(result,null,2),'utf8');
 process.stdout.write('COUPON SNAPSHOT '+JSON.stringify({status:result.status,
  simulations:result.candidates.length,matches:result.matches_eligible,errors:result.errors.length})+'\n');
}
module.exports={generate,packCoupon};
