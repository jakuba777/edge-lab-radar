/* EDGE LAB DUAL: simulation-only portfolio construction; never assumes independence. */
(function(root,factory){
 const api=factory(typeof module==="object"&&module.exports?require("./value-engine-v2.js"):root.EdgeValueEngine);
 if(typeof module==="object"&&module.exports)module.exports=api;else root.EdgeDual=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(engine){
 "use strict";
 function buildDual(inputs,options={}){
  const ranked=engine.rankCandidates(inputs||[]);
  const stable=ranked.filter(x=>x.input.track==="A"&&x.input.probability>=0.65);
  const high=ranked.filter(x=>x.input.track==="B"&&x.input.odds>=1.8);
  function combos(items,min,max,range){
   const out=[];
   function walk(start,picks){
    if(picks.length>=min){
     const ids=picks.map(x=>x.result.matchId);
     if(new Set(ids).size===ids.length){
      const odds=picks.reduce((n,x)=>n*x.input.odds,1);
      if(odds>=range[0]&&odds<=range[1])out.push({
       selections:picks.map(x=>({matchId:x.result.matchId,marketId:x.result.marketId,odds:x.input.odds})),
       combinedOdds:odds,combinedProbability:null,combinedExpectedRoi:null,
       status:"UNVERIFIED_COMBINATION",reason:"joint_probability_not_estimated"
      });
     }
    }
    if(picks.length>=max)return;
    for(let i=start;i<items.length;i++)walk(i+1,picks.concat(items[i]));
   }
   walk(0,[]);
   return out.sort((a,b)=>Math.abs(a.combinedOdds-(range[0]+range[1])/2)-Math.abs(b.combinedOdds-(range[0]+range[1])/2)).slice(0,20);
  }
  return {
   stable:combos(stable,1,2,[1,4]),
   highOdds:combos(high,2,3,[6,10]),
   audit:{stableCandidates:stable.length,highOddsCandidates:high.length,
    warning:"Illustrative candidates only. No validated joint probability or coupon EV."}
  };
 }
 return Object.freeze({buildDual});
});
