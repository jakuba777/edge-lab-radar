'use strict';
/* EDGE LAB Price Lab — educational comparison, never bookmaker odds.
   Pure functions shared by the browser and Node tests. */
(function(root){
 const normalize=(x)=>Number.isFinite(x)?x:NaN;
 const fairOdds=p=>Number.isFinite(p)&&p>0&&p<1?1/p:NaN;
 const breakEvenOdds=(p,tax=.12)=>Number.isFinite(p)&&p>0&&p<1&&tax>=0&&tax<1?1/(p*(1-tax)):NaN;
 function compareQuote(p,actualOdds,tax=.12){
  const price=Number(String(actualOdds??'').trim().replace(',','.'));
  if(!Number.isFinite(price)||price<=1||price>10000||!Number.isFinite(p)||p<=0||p>=1)return null;
  return {actualOdds:price,modelP:p,impliedBreakEvenP:1/(price*(1-tax)),
   modelDifference:p-1/(price*(1-tax)),fairOdds:fairOdds(p),
   modelBreakEvenOdds:breakEvenOdds(p,tax),calibrated:false};
 }
 function discover(matches,markets,options={}){
  if(!Array.isArray(matches)||!Array.isArray(markets))return [];
  const min=Number.isFinite(options.min)?options.min:1.5;
  const max=Number.isFinite(options.max)?options.max:2.5;
  const limit=Number.isInteger(options.limit)?Math.max(1,Math.min(24,options.limit)):12;
  if(min<=1||max<=min||max>100)return [];
  const center=Math.sqrt(min*max),all=[];
  for(const match of matches){
   const model=match?.model;
   if(!model||model.exploratory||!model.ps||Math.min(model.nH,model.nA)<6||model.nLeague<55)continue;
   const sample=Math.min(model.nH,model.nA);
   const optionsForMatch=[];
   for(const market of markets){
    const p=normalize(model.ps[market.id]),fair=fairOdds(p);
    if(!Number.isFinite(fair)||fair<min||fair>max||p<.05||p>.85)continue;
    const base=normalize(model.base?.[market.id]);
    const diff=Number.isFinite(base)?Math.abs(p-base):null;
    // Large model-vs-league disagreement should not be promoted as a 'value' signal.
    if(diff!==null&&diff>.22)continue;
    const evidence=Math.min(sample,10)/10;
    const score=evidence*.56+(.44/(1+Math.abs(Math.log(fair/center))))-(diff===null?.05:diff*.45);
    optionsForMatch.push({match,marketId:market.id,label:market.label,p,
     fairOdds:fair,modelBreakEvenOdds:breakEvenOdds(p),
     sampleMin:sample,leagueSample:model.nLeague,
     baselineDiff:diff,score});
   }
   optionsForMatch.sort((a,b)=>b.score-a.score||a.fairOdds-b.fairOdds);
   // At most two distinct alternatives from one fixture, not two simultaneous picks.
   all.push(...optionsForMatch.slice(0,2).map((x,i)=>({...x,alternate:i>0})));
  }
  all.sort((a,b)=>b.score-a.score||String(a.match.date).localeCompare(String(b.match.date))||a.marketId.localeCompare(b.marketId));
  const found=[],seenMatch=new Set(),usage=new Map();
  for(const pass of [0,1]){
   for(const x of all){
    if(found.length>=limit)break;
    if(pass===0&&seenMatch.has(x.match.id))continue;
    if(pass===1&&!seenMatch.has(x.match.id))continue;
    if(found.some(y=>y.match.id===x.match.id&&y.marketId===x.marketId))continue;
    if((usage.get(x.marketId)||0)>=Math.max(2,Math.ceil(limit/3)))continue;
    found.push(x);seenMatch.add(x.match.id);
    usage.set(x.marketId,(usage.get(x.marketId)||0)+1);
   }
  }
  return found;
 }

 /* Explain every researched market in terms of observed inputs, not betting advice.
    All percentages refer to an uncalibrated Poisson model, not market edge. */
 function explainCandidate(item){
  if(!item||!item.match?.model||!Number.isFinite(item.p))return null;
  const m=item.match.model;
  const fmtP=v=>(100*v).toFixed(1).replace('.',',')+'%';
  const fmtG=v=>Number(v).toFixed(2).replace('.',',');
  const p=item.p,loss=1-p,sample=Math.min(m.nH,m.nA);
  const total=Number.isFinite(m.lh)&&Number.isFinite(m.la)?m.lh+m.la:null;
  let context;
  switch(item.marketId){
   case 'o15':case 'o25':case 'o35':case 'u25':case 'u35':
    context=total!==null?'Modelowe oczekiwane gole łącznie: '+fmtG(total)+'.':'Brak rozbicia oczekiwanych goli.';
    break;
   case 'btts':case 'bttsNo':
    context=Number.isFinite(m.lh)&&Number.isFinite(m.la)?
     'Modelowe oczekiwane gole: gospodarze '+fmtG(m.lh)+', goście '+fmtG(m.la)+'.':
     'Ocena wynika ze wspólnej siatki możliwych wyników.';
    break;
   default:
    context=Number.isFinite(m.lh)&&Number.isFinite(m.la)?
     'Modelowe oczekiwane gole: '+fmtG(m.lh)+' do '+fmtG(m.la)+'.':
     'Ocena wynika z rozkładu możliwych wyników.';
  }
  const baseline=Number(m.base?.[item.marketId]);
  const baselineOK=m.base?.[item.marketId]!==undefined&&Number.isFinite(baseline)&&baseline>=0&&baseline<=1;
  const diff=baselineOK?(p-baseline)*100:null;
  const baseNote=diff===null?
   'Brak porównania z ligową częstością historyczną.':
   'Liga historycznie: '+fmtP(baseline)+'; różnica modelu: '+(diff>=0?'+':'')+
    diff.toFixed(1).replace('.',',')+' pkt proc. Ta różnica nie jest przewagą nad kursem.';
  const why='Zdarzenie mieści się w wybranym przedziale kursu teoretycznego. '+
   'Model szacuje prawdopodobieństwo '+fmtP(p)+', na podstawie '+m.nH+
   ' wcześniejszych meczów domowych i '+m.nA+' wyjazdowych ('+m.nLeague+
   ' wcześniejszych wyników ligowych).';
  const supporting=context+' '+baseNote;
  const against='Modelowe ryzyko nietrafienia: '+fmtP(loss)+
   '. '+(sample<8?'Bardzo ograniczona próba drużynowa. ':'')+
   'Model Poissona nie uwzględnia aktualnych składów, czerwonych kartek ani motywacji. '+
   'Nie jest skalibrowany; kurs bukmachera nie jest automatycznie dostępny.';
  return {why,supporting,against,probability:p,lossProbability:loss};
 }

 function overlaps(coupons){
  const counts=new Map();
  for(const c of coupons||[]){
   const keys=new Set((c.legs||[]).map(l=>l.match?.id+':'+l.id));
   keys.forEach(k=>counts.set(k,(counts.get(k)||0)+1));
  }
  return (coupons||[]).map(c=>{
   const shared=(c.legs||[]).filter(l=>(counts.get(l.match?.id+':'+l.id)||0)>1);
   return {count:shared.length,keys:shared.map(l=>l.match.id+':'+l.id)};
  });
 }
 const api={fairOdds,breakEvenOdds,compareQuote,discover,explainCandidate,overlaps};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.EDGEPRICE=api;
})(typeof window!=='undefined'?window:null);
