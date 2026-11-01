/* EDGE LAB Multi-Market: quote validation and exploratory coupon combinations. No automatic betting. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.EdgeMultiMarket=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const num=x=>typeof x==="number"&&Number.isFinite(x);
function screen(q,opts={}){
 const now=Date.parse(opts.now||"");const age=opts.maxAgeMinutes===undefined?15:opts.maxAgeMinutes;
 const reasons=[];
 if(!q||typeof q!=="object")return {status:"REJECTED",reasons:["invalid_quote"]};
 if(!q.matchId||!q.marketId||!q.source||!q.quoteId)reasons.push("missing_provenance");
 if(!num(q.odds)||q.odds<=1)reasons.push("invalid_odds");
 if(q.marketStatus!=="open")reasons.push("closed_market");
 const ts=Date.parse(q.oddsAt||"");
 if(!Number.isFinite(now)||!Number.isFinite(ts)||ts>now||now-ts>age*60000)reasons.push("stale_quote");
 if(q.isBuilder&&(!q.builderLegs||q.builderLegs.length<2||q.bookmakerCombinedQuote!==true))reasons.push("unverified_builder_price");
 if(reasons.length)return {status:"REJECTED",reasons};
 const tax=opts.taxRate===undefined?0.12:opts.taxRate;
 if(!num(tax)||tax<0||tax>=1)return {status:"REJECTED",reasons:["invalid_tax"]};
 const probability=q.probability,lower=q.lowerProbability;
 if(!num(probability)||!num(lower)||lower<0||probability>1||lower>probability)return {status:"UNVERIFIED",reasons:["missing_validated_probability"]};
 const conservativeEV=lower*q.odds*(1-tax)-1;
 return {status:q.calibrationVerified===true&&conservativeEV>0?"VALUE_CANDIDATE":"UNVERIFIED",reasons:q.calibrationVerified===true?conservativeEV>0?[]:["negative_conservative_ev"]:["unverified_calibration"],conservativeEV};
}
function combine(quotes,opts={}){
 if(!Array.isArray(quotes))throw Error("invalid_quotes");
 const minLegs=opts.minLegs===undefined?2:opts.minLegs,maxLegs=opts.maxLegs===undefined?4:opts.maxLegs;
 const minTotal=opts.minTotal===undefined?8:opts.minTotal,maxTotal=opts.maxTotal===undefined?9:opts.maxTotal;
 const cap=opts.maxCandidates===undefined?200:opts.maxCandidates;
 if(!Number.isInteger(minLegs)||!Number.isInteger(maxLegs)||minLegs<1||maxLegs>5||minLegs>maxLegs||!num(minTotal)||!num(maxTotal)||minTotal<=1||maxTotal<minTotal||!Number.isInteger(cap)||cap<1||cap>1000)throw Error("invalid_options");
 const eligible=quotes.filter(q=>screen(q,opts).status==="VALUE_CANDIDATE").slice(0,cap);
 const out=[];
 function walk(start,chosen,total,used){
  if(chosen.length>=minLegs&&total>=minTotal&&total<=maxTotal)out.push({quoteIds:chosen.map(x=>x.quoteId),matchIds:chosen.map(x=>x.matchId),odds:total,status:"JOINT_PROBABILITY_UNVERIFIED",expectedRoi:null});
  if(chosen.length>=maxLegs||total>maxTotal)return;
  for(let i=start;i<eligible.length;i++){const q=eligible[i];if(used.has(q.matchId))continue;used.add(q.matchId);chosen.push(q);walk(i+1,chosen,total*q.odds,used);chosen.pop();used.delete(q.matchId);}
 }
 walk(0,[],1,new Set());
 return out.sort((a,b)=>Math.abs(a.odds-(minTotal+maxTotal)/2)-Math.abs(b.odds-(minTotal+maxTotal)/2)).slice(0,50);
}
return Object.freeze({screen,combine});
});
