/* EDGE LAB: deterministic, chronological paper-trading audit. No betting execution. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.EdgeBacktest=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
function audit(records,config={}){
 const tax= config.taxRate===undefined?0.12:config.taxRate;
 const stake=config.stake===undefined?1:config.stake;
 if(!Number.isFinite(tax)||tax<0||tax>=1||!Number.isFinite(stake)||stake<=0)throw Error("invalid_config");
 if(!Array.isArray(records))throw Error("records_must_be_array");
 const seen=new Set(),accepted=[],rejected=[];
 for(const row of records){
  const id=String(row&&row.id||"");
  const placed=Date.parse(row&&row.predictedAt||"");
  const start=Date.parse(row&&row.startsAt||"");
  const oddsTime=Date.parse(row&&row.oddsAt||"");
  const odds=row&&row.odds, result=row&&row.won;
  const valid=id&& !seen.has(id)&&Number.isFinite(placed)&&Number.isFinite(start)&&Number.isFinite(oddsTime)&&oddsTime<=placed&&placed<start&&Number.isFinite(odds)&&odds>1&&typeof result==="boolean"&&row.marketStatus==="open";
  if(!valid){rejected.push({id,reason:"invalid_or_lookahead_record"});continue;}
  seen.add(id);
  const profit=result?stake*(odds*(1-tax)-1):-stake;
  accepted.push({id,predictedAt:row.predictedAt,profit,won:result,odds});
 }
 const n=accepted.length,wins=accepted.filter(x=>x.won).length;
 const total=accepted.reduce((a,x)=>a+x.profit,0);
 let balance=0,peak=0,maxDrawdown=0;
 for(const x of accepted){balance+=x.profit;peak=Math.max(peak,balance);maxDrawdown=Math.max(maxDrawdown,peak-balance);}
 return {status:n?"DESCRIPTIVE_ONLY":"INSUFFICIENT_DATA",count:n,rejected:rejected.length,wins,hitRate:n?wins/n:null,netProfit:total,roi:n?total/(n*stake):null,maxDrawdownUnits:maxDrawdown,records:accepted,rejections:rejected,warning:"Historical ROI does not establish predictive edge. Check selection bias, timestamp integrity, and uncertainty."};
}
return Object.freeze({audit});
});
