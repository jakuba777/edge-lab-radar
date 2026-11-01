/* EDGE LAB: append-only quote snapshots; snapshots are observations, not verified bookmaker feeds. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.EdgeQuoteSnapshots=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const validTime=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))&&/(Z|[+-]\d\d:\d\d)$/.test(s);
function ingest(existing,batch,options={}){
 if(!Array.isArray(existing)||!Array.isArray(batch))throw Error("invalid_input");
 const now=options.receivedAt;
 if(!validTime(now))throw Error("invalid_received_at");
 const rows=existing.slice(),keys=new Set(rows.map(x=>x.snapshotId));
 const rejected=[];
 for(const x of batch){
  const reasons=[];
  if(!x||typeof x!=="object"){rejected.push({reasons:["invalid_record"]});continue;}
  for(const k of ["snapshotId","quoteId","matchId","marketId","source"])if(typeof x[k]!=="string"||!x[k].trim())reasons.push("missing_"+k);
  if(!validTime(x.oddsAt))reasons.push("invalid_odds_at");
  if(!Number.isFinite(x.odds)||x.odds<=1)reasons.push("invalid_odds");
  if(x.marketStatus!=="open"&&x.marketStatus!=="closed")reasons.push("invalid_status");
  if(validTime(x.oddsAt)&&Date.parse(x.oddsAt)>Date.parse(now))reasons.push("future_quote");
  if(keys.has(x.snapshotId))reasons.push("duplicate_snapshot");
  if(reasons.length){rejected.push({snapshotId:x.snapshotId,reasons});continue;}
  const record=Object.freeze({...x,receivedAt:now});
  rows.push(record);keys.add(x.snapshotId);
 }
 return {records:Object.freeze(rows),accepted:rows.length-existing.length,rejected};
}
function latest(records){
 if(!Array.isArray(records))throw Error("invalid_input");
 const map=new Map();
 for(const r of records){
  const key=r.matchId+"|"+r.marketId+"|"+r.source;
  const prev=map.get(key);
  if(!prev||Date.parse(r.oddsAt)>Date.parse(prev.oddsAt)||(r.oddsAt===prev.oddsAt&&Date.parse(r.receivedAt)>Date.parse(prev.receivedAt)))map.set(key,r);
 }
 return [...map.values()].sort((a,b)=>a.matchId.localeCompare(b.matchId)||a.marketId.localeCompare(b.marketId));
}
return Object.freeze({ingest,latest});
});
