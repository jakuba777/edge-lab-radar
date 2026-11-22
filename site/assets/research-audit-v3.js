/* Retrospective probability audit. No live selections. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.EdgeResearchAudit=api;})(globalThis,function(){
"use strict";
const prob=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1;
function audit(rows){
 if(!Array.isArray(rows))throw Error("invalid_records");
 let n=0, wins=0, low=0, high=0, baseline=0;const seen=new Set(),excluded={invalid:0,duplicate:0,unsettled:0};
 for(const r of rows){
 if(!r||typeof r.id!=="string"||!r.id.trim()||!prob(r.lowerProbability)||!prob(r.upperProbability)||r.lowerProbability>r.upperProbability||!Number.isFinite(Date.parse(r.predictedAt))||!Number.isFinite(Date.parse(r.startsAt))||Date.parse(r.predictedAt)>=Date.parse(r.startsAt)){excluded.invalid++;continue;}
 if(seen.has(r.id)){excluded.duplicate++;continue;}seen.add(r.id);
 if(r.status!=="final"||typeof r.won!=="boolean"||!Array.isArray(r.resultSources)||!r.resultSources.some(s=>typeof s==="string"&&s.trim())){excluded.unsettled++;continue;}
 const y=Number(r.won);n++;wins+=y;low+=(r.lowerProbability-y)**2;high+=(r.upperProbability-y)**2;baseline+=(0.5-y)**2;
 }
 return {n,wins,excluded,hitRate:n?wins/n:null,brierLower:n?low/n:null,brierUpper:n?high/n:null,brierBaseline:n?baseline/n:null,status:"DESCRIPTIVE_ONLY"};
}
return Object.freeze({audit});
});