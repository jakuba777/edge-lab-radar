'use strict';
/* Descriptive, retrospective audit. No betting recommendations or calibrated probabilities. */
(function(){
function calibration(rows,{strict=false}={}){
 const newBin=()=>({n:0,p:0,y:0,brier:0,loss:0});
 const bins=Array.from({length:10},newBin),groups=new Map(),seen=new Map();
 let rejected=0,pending=0,conflicts=0;
 const day=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
 for(const r of rows){
  if(!r||!['hit','miss'].includes(r.state)){pending++;continue;}
  const market=r.market||r.label||'unknown';
  if(!Number.isFinite(r.p)||r.p<0||r.p>1||!r.date||!r.league||!r.home||!r.away){rejected++;continue;}
  if(strict&&(!r.market||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||typeof r.snapshot_utc!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(r.snapshot_utc)||!Number.isFinite(Date.parse(r.snapshot_utc))||day(Date.parse(r.snapshot_utc))>=r.date)){rejected++;continue;}
  const key=JSON.stringify([r.date,r.league,r.home,r.away,market]);
  const prior=seen.get(key);
  if(prior){rejected++;if(prior.p!==r.p||prior.state!==r.state){conflicts++;seen.set(key,{...prior,conflict:true});}continue;}
  seen.set(key,{...r,market});
 }
 for(const r of seen.values()){
  if(r.conflict){rejected++;continue;}
  const y=Number(r.state==='hit'),p=r.p,q=Math.max(1e-15,Math.min(1-1e-15,p));
  if(!groups.has(r.market))groups.set(r.market,newBin());
  for(const b of [bins[Math.min(9,Math.floor(p*10))],groups.get(r.market)]){
   b.n++;b.p+=p;b.y+=y;b.brier+=(p-y)**2;b.loss-=y*Math.log(q)+(1-y)*Math.log(1-q);
  }
 }
 return {bins,rejected,pending,conflicts,markets:[...groups].map(([market,b])=>({market,...b})).sort((a,b)=>b.n-a.n||a.market.localeCompare(b.market))};
}
function describe(b){
 if(!b.n)return null;
 return {n:b.n,mean:b.p/b.n,observed:b.y/b.n,gap:(b.y-b.p)/b.n,brier:b.brier/b.n,logLoss:b.loss/b.n,smallSample:b.n<100};
}
if(typeof module!=='undefined')module.exports={calibration,describe};
if(typeof document==='undefined')return;
document.addEventListener('DOMContentLoaded',async()=>{
 const el=document.getElementById('calibration-audit');if(!el)return;
 const add=(tag,s)=>{const n=document.createElement(tag);n.textContent=s;el.append(n);return n;};
 const pct=p=>(100*p).toFixed(1)+'%';
 const line=b=>{const x=describe(b);return 'N='+x.n+' | prognoza '+pct(x.mean)+' | wynik '+pct(x.observed)+' | różnica '+(100*x.gap).toFixed(1)+' p.p. | Brier '+x.brier.toFixed(4)+' | Log loss '+x.logLoss.toFixed(4)+(x.smallSample?' · mała próba':'');};
 try{
  const res=await fetch('./data/track_record.json',{cache:'no-store'});if(!res.ok)throw Error();
  const d=await res.json(),stamp=Date.parse(d.updated_utc),age=Date.now()-stamp;
  if(d.status!=='ready'||!Number.isFinite(stamp)||age<0||age>12*3600000||!Array.isArray(d.entries?.main))throw Error();
  el.replaceChildren();add('p','Aktualizacja raportu: '+new Date(stamp).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'}));
  for(const [label,rows] of [['Prognozy główne',d.entries.main],['Pierwsza połowa — osobny model',d.entries.halftime_research]]){
   if(!Array.isArray(rows))continue;
   add('h3',label);
   const a=calibration(rows,{strict:true}),n=a.bins.reduce((s,b)=>s+b.n,0);
   add('p','Rozliczone i poprawne: '+n+' · pominięte/odrzucone: '+a.rejected+' · konflikty duplikatów: '+a.conflicts+' · oczekujące lub inne: '+a.pending);
   if(!n){add('p','Brak poprawnych rozliczonych prognoz z udokumentowanym snapshotem sprzed dnia meczu.');continue;}
   add('h4','Wyniki według rynku');
   a.markets.forEach(b=>add('p',b.market+' | '+line(b)));
   add('h4','Przedziały prognoz — przekrój opisowy');
   a.bins.forEach((b,i)=>{if(b.n)add('p',(i*10)+'–'+((i+1)*10)+'% | '+line(b));});
  }
  add('p','Audyt opisowy ograniczonego archiwum, nie dowód przewagi ani kalibracja. N<100 to robocza flaga małej próby, nie gwarancja przy większym N. Zdarzenia mogą być zależne. Nie porównuj Brier między różnymi rynkami bez uwzględnienia ich częstości bazowej.');
 }catch{el.textContent='Raport niedostępny, nieaktualny (ponad 12 godzin) lub niepoprawny. Nie wyświetlamy starych wskaźników jako bieżących.';}
});
})();
