'use strict';
/* EDGE LAB 0.6 — mathematical research functions only.
   Experimental pre-match probabilities, NOT calibrated; no odds feed or bets.
   Node unit tests and browser UI share this exact engine. */
(function(root){
 const MARKETS=[
  {id:'hg',label:'Gospodarze strzelą gola',fn:(h,a)=>h>0},
  {id:'ag',label:'Goście strzelą gola',fn:(h,a)=>a>0},
  {id:'o15',label:'Powyżej 1,5 gola',fn:(h,a)=>h+a>=2},
  {id:'o25',label:'Powyżej 2,5 gola',fn:(h,a)=>h+a>=3},
  {id:'u35',label:'Poniżej 3,5 gola',fn:(h,a)=>h+a<=3},
  {id:'btts',label:'Obie strzelą',fn:(h,a)=>h>0&&a>0},
  {id:'h2',label:'Gospodarze 2+ gole',fn:(h,a)=>h>=2},
  {id:'a2',label:'Goście 2+ gole',fn:(h,a)=>a>=2},
  {id:'oneX',label:'Gospodarze nie przegrają (1X)',fn:(h,a)=>h>=a},
  {id:'x2',label:'Goście nie przegrają (X2)',fn:(h,a)=>a>=h},
  {id:'home',label:'Wygrana gospodarzy',fn:(h,a)=>h>a},
  {id:'away',label:'Wygrana gości',fn:(h,a)=>a>h}
 ];
 const map=new Map(MARKETS.map(m=>[m.id,m]));
 const fmtP=x=>Number.isFinite(x)?(x*100).toFixed(1).replace('.',',')+'%':'—';
 const fmt=x=>Number.isFinite(x)?x.toFixed(2).replace('.',','):'—';
 function poisson(k,lambda){let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p;}
 function grid(lh,la){
  if(!Number.isFinite(lh)||!Number.isFinite(la)||lh<0||la<0)return [];
  const rows=[];let total=0;
  for(let h=0;h<=12;h++)for(let a=0;a<=12;a++){
   const p=poisson(h,lh)*poisson(a,la);rows.push({h,a,p});total+=p;
  }
  return rows.map(r=>({...r,p:r.p/total}));
 }
 function probability(rows,fn){return rows.reduce((s,r)=>s+(fn(r.h,r.a)?r.p:0),0);}
 function marketP(rows,id){return map.has(id)?probability(rows,map.get(id).fn):NaN;}
 function parseCSV(s){
  const lines=[];let part='',cols=[],quoted=false;
  s=String(s||'').replace(/^\uFEFF/,'');
  for(let i=0;i<s.length;i++){
   const c=s[i];
   if(c==='"'){if(quoted&&s[i+1]==='"'){part+='"';i++;}else quoted=!quoted;}
   else if(c===','&&!quoted){cols.push(part);part='';}
   else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;cols.push(part);part='';if(cols.some(v=>v!==''))lines.push(cols);cols=[];}
   else part+=c;
  }
  cols.push(part);if(cols.some(v=>v!==''))lines.push(cols);
  if(lines.length<2)return [];
  const heads=lines.shift().map(x=>x.trim());
  return lines.map(vals=>Object.fromEntries(heads.map((head,i)=>[head,vals[i]??''])));
 }
 function validDate(s){return typeof s==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));}
 function n(s){return s!==''&&s!==undefined&&s!==null&&Number.isFinite(Number(s))?Number(s):null;}
 function daysBetween(d1,d2){return (Date.parse(d1+'T00:00:00Z')-Date.parse(d2+'T00:00:00Z'))/86400000;}
 function average(rows,fn){return rows.reduce((s,r)=>s+fn(r),0)/rows.length;}
 function analyze(match,history){
  // STRICT EXCLUSIVE day boundary: no same-day results, no future leakage.
  const past=history.filter(r=>r.date<match.date);
  const home=past.filter(r=>r.home===match.home).slice(-10);
  const away=past.filter(r=>r.away===match.away).slice(-10);
  if(past.length<55||home.length<6||away.length<6)return null;
  const hb=Math.max(.2,average(past,r=>r.hs)),ab=Math.max(.2,average(past,r=>r.as));
  const shr=(xs,key,base)=>(average(xs,r=>r[key])*xs.length+base*5)/(xs.length+5);
  const lh=Math.max(.25,Math.min(3.7,Math.sqrt(shr(home,'hs',hb)*shr(away,'hs',hb))));
  const la=Math.max(.25,Math.min(3.7,Math.sqrt(shr(away,'as',ab)*shr(home,'as',ab))));
  const dist=grid(lh,la);
  const ps=Object.fromEntries(MARKETS.map(m=>[m.id,marketP(dist,m.id)]));
  const base=Object.fromEntries(MARKETS.map(m=>[m.id,(2+past.reduce((v,r)=>v+(m.fn(r.hs,r.as)?1:0),0))/(4+past.length)]));
  return {lh,la,dist,ps,base,nH:home.length,nA:away.length,nLeague:past.length};
 }
 function quoteThreshold(p,tax=.12){return Number.isFinite(p)&&p>0&&p<=1&&tax>=0&&tax<1?1/((1-tax)*p):NaN;}
 function jointSameGame(rows,ids){
  if(!rows?.length||!ids?.length||ids.some(x=>!map.has(x)))return NaN;
  return probability(rows,(h,a)=>ids.every(x=>map.get(x).fn(h,a)));
 }
 function jointSeparate(legs){
  if(!legs.length||new Set(legs.map(x=>x.match.id)).size!==legs.length)return NaN;
  if(legs.some(x=>!Number.isFinite(x.p)||x.p<=0||x.p>=1))return NaN;
  return legs.reduce((p,x)=>p*x.p,1);
 }
 const candidatesFor=(match,profile)=>{
  const ps=match.model.ps,base=match.model.base;
  let ids;
  if(profile==='selective')ids=['hg','ag','o15','u35','oneX','x2'];
  else if(profile==='balanced')ids=['hg','ag','o15','o25','u35','btts','oneX','x2'];
  else ids=['hg','ag','o25','u35','btts','home','away','h2','a2'];
  return ids.map(id=>{
    const p=ps[id],diff=p-base[id];
    const eligible=profile==='selective'?p>=.69&&p<=.90:
      profile==='balanced'?p>=.49&&p<=.82:
      p>=.27&&p<=.75&&Math.abs(diff)>=.07&&match.model.nLeague>=100;
    if(!eligible)return null;
    // Ranking is intentionally descriptive, NOT projected bookmaker edge.
    const evidence=Math.min(1,Math.min(match.model.nH,match.model.nA)/10);
    const score=profile==='selective'?(p*.75+evidence*.25):
     profile==='balanced'?(.6*Math.min(p,.75)+evidence*.28+.12*(1-Math.abs(diff))):
     (.5*Math.abs(diff)+.3*evidence+.2*(1-Math.abs(p-.5)));
    return {match,id,p,diff,score,label:map.get(id).label};
  }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,4);
 };
 function buildMultis(matches,profile,count,max=5){
  if(!Number.isInteger(count)||count<2||count>4)return [];
  const pool=[];
  for(const match of matches)pool.push(...candidatesFor(match,profile));
  pool.sort((a,b)=>b.score-a.score||a.match.date.localeCompare(b.match.date));
  // Use bounded greedy search with distinct seed offsets and a diversity penalty.
  const results=[],seen=new Set();
  for(let seed=0;seed<Math.min(55,pool.length);seed++){
   const legs=[],used=new Set(),usedLeagues=new Map(),marketCount=new Map();
   const order=[pool[seed],...pool].filter(Boolean);
   for(const x of order){
    if(used.has(x.match.id)||(marketCount.get(x.id)||0)>=2)continue;
    if(profile!=='selective'&&usedLeagues.get(x.match.leagueId)>=2)continue;
    legs.push(x);used.add(x.match.id);
    usedLeagues.set(x.match.leagueId,(usedLeagues.get(x.match.leagueId)||0)+1);
    marketCount.set(x.id,(marketCount.get(x.id)||0)+1);
    if(legs.length===count)break;
   }
   if(legs.length!==count)continue;
   const key=legs.map(x=>x.match.id+':'+x.id).sort().join('|');
   if(seen.has(key))continue;seen.add(key);
   const p=jointSeparate(legs);
   if(!Number.isFinite(p)||p<.045)continue;
   results.push({
     profile,type:'separate',legs,p,requiredOdds:quoteThreshold(p),
     sampleMin:Math.min(...legs.map(x=>x.match.model.nH),...legs.map(x=>x.match.model.nA)),
     date:legs.map(x=>x.match.date).sort()[0],
     score:legs.reduce((s,x)=>s+x.score,0)/legs.length,
     forText:'Model opiera się na wcześniejszych spotkaniach dom/wyjazd; '+legs.length+' osobne mecze.',
     againstText:'Iloczyn szans zakłada niezależność meczów. Nie znamy kursów, zmian składu ani aktualnej sytuacji klubów.',
     hypothesis:profile==='contrarian'?'Odchylenie modelu od historycznej częstości ligowej, nie od ceny bukmachera.':
     'Selekcja na podstawie danych historycznych, a nie zweryfikowanej przewagi rynkowej.'
   });
  }
  return results.sort((a,b)=>b.score-a.score||b.p-a.p).slice(0,max);
 }
 const CORRELATIONS=[
  ['btts','o25'],['hg','u35'],['ag','u35'],['o25','h2'],['o25','a2'],
  ['hg','ag'],['btts','u35'],['oneX','o25'],['x2','o25']
 ];
 function buildBuilders(matches,max=5){
  const results=[];
  for(const match of matches){
   if(!match.model)continue;
   for(const ids of CORRELATIONS){
    const p=jointSameGame(match.model.dist,ids);
    const min=Math.min(...ids.map(id=>match.model.ps[id]));
    // Avoid impossible/redundant or almost identical intersections.
    if(p<.12||p>.74||p>=min-.02)continue;
    results.push({profile:'builder',type:'joint',p,requiredOdds:quoteThreshold(p),
      date:match.date,score:Math.min(match.model.nH,match.model.nA)/10-Math.abs(.38-p),
      legs:ids.map(id=>({match,id,p:match.model.ps[id],label:map.get(id).label})),
      forText:'Zdarzenia w jednym meczu są obliczane łącznie na jednej siatce wyników.',
      againstText:'Model zakłada rozkład bramek Poissona. Nie uwzględnia bieżących składów ani kursu całego Bet Buildera.',
      hypothesis:'Scenariusz łączny jest matematyczny, nie jest oceną wartości oferowanego kursu.'});
   }
  }
  const seen=new Set();
  return results.sort((a,b)=>b.score-a.score).filter(x=>{
   const key=x.legs[0].match.id;
   if(seen.has(key))return false;
   seen.add(key);return true;
  }).slice(0,max);
 }
 function createCoupons(matches,profile,count,max=5){
  const eligible=matches.filter(m=>m.model&&validDate(m.date)&&m.home&&m.away);
  if(profile==='builder')return buildBuilders(eligible,max);
  if(!['selective','balanced','contrarian'].includes(profile))return [];
  return buildMultis(eligible,profile,count,max);
 }
 const API={MARKETS,grid,poisson,probability,marketP,parseCSV,validDate,n,daysBetween,analyze,
   quoteThreshold,jointSameGame,jointSeparate,candidatesFor,createCoupons,fmtP,fmt};
 if(typeof module!=='undefined'&&module.exports)module.exports=API;
 if(root)root.EDGECOUPONS=API;
})(typeof window!=='undefined'?window:null);
