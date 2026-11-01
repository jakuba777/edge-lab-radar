/* EDGE LAB prediction ledger: immutable-by-convention, append-only records. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.EdgeLedger=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const validTime=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))&&/(Z|[+-]\d\d:\d\d)$/.test(s);
function validate(x){
 const reasons=[];
 if(!x||typeof x!=="object")return {valid:false,reasons:["invalid_record"]};
 for(const k of ["id","matchId","marketId","modelVersion","source"])if(typeof x[k]!=="string"||!x[k].trim())reasons.push("missing_"+k);
 for(const k of ["predictedAt","startsAt","oddsAt"])if(!validTime(x[k]))reasons.push("invalid_"+k);
 if(reasons.length===0){
  if(Date.parse(x.predictedAt)>=Date.parse(x.startsAt))reasons.push("prediction_after_start");
  if(Date.parse(x.oddsAt)>Date.parse(x.predictedAt))reasons.push("future_odds");
 }
 if(typeof x.odds!=="number"||!Number.isFinite(x.odds)||x.odds<=1)reasons.push("invalid_odds");
 if(typeof x.probability!=="number"||!Number.isFinite(x.probability)||x.probability<0||x.probability>1)reasons.push("invalid_probability");
 if(typeof x.lowerProbability!=="number"||!Number.isFinite(x.lowerProbability)||x.lowerProbability<0||x.lowerProbability>x.probability)reasons.push("invalid_lower_probability");
 if(x.marketStatus!=="open")reasons.push("market_not_open");
 return {valid:reasons.length===0,reasons};
}
function append(ledger,record){
 if(!Array.isArray(ledger))throw Error("invalid_ledger");
 const v=validate(record);if(!v.valid)return {ok:false,reasons:v.reasons,ledger};
 if(ledger.some(x=>x.id===record.id))return {ok:false,reasons:["duplicate_id"],ledger};
 const next=ledger.concat([Object.freeze({...record})]);
 return {ok:true,reasons:[],ledger:Object.freeze(next)};
}
function settle(ledger,outcomes){
 if(!Array.isArray(ledger)||!Array.isArray(outcomes))throw Error("invalid_input");
 const map=new Map();
 for(const x of outcomes){if(!x||typeof x.id!=="string"||typeof x.won!=="boolean"||map.has(x.id))throw Error("invalid_outcome");map.set(x.id,x.won);}
 return ledger.filter(x=>map.has(x.id)).map(x=>({...x,won:map.get(x.id)}));
}
return Object.freeze({validate,append,settle});
});
