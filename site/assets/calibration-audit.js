'use strict';
(function(){
function calibration(rows){
 const bins=Array.from({length:10},()=>({n:0,p:0,y:0,brier:0,loss:0}));
 const seen=new Set();let rejected=0;
 for(const r of rows){
  if(!r||!['hit','miss'].includes(r.state))continue;
  if(!Number.isFinite(r.p)||r.p<0||r.p>1||!r.date||!r.league||!r.home||!r.away){rejected++;continue;}
  const key=JSON.stringify([r.date,r.league,r.home,r.away,r.market||r.label||'']);
  if(seen.has(key)){rejected++;continue;}seen.add(key);
  const y=Number(r.state==='hit'),p=r.p,b=bins[Math.min(9,Math.floor(p*10))],q=Math.max(1e-15,Math.min(1-1e-15,p));
  b.n++;b.p+=p;b.y+=y;b.brier+=(p-y)**2;b.loss-=y*Math.log(q)+(1-y)*Math.log(1-q);
 }
 return {bins,rejected};
}
if(typeof module!=='undefined')module.exports={calibration};
if(typeof document==='undefined')return;
document.addEventListener('DOMContentLoaded',async()=>{
 const el=document.getElementById('calibration-audit');if(!el)return;
 const add=(tag,s)=>{const n=document.createElement(tag);n.textContent=s;el.append(n);return n;};
 try{
  const res=await fetch('./data/track_record.json',{cache:'no-store'});if(!res.ok)throw Error();
  const d=await res.json(),stamp=Date.parse(d.updated_utc),age=Date.now()-stamp;
  if(d.status!=='ready'||!Number.isFinite(stamp)||age<0||age>12*3600000||!Array.isArray(d.entries?.main))throw Error();
  el.replaceChildren();add('p','Aktualizacja raportu: '+new Date(stamp).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'}));
  const {bins,rejected}=calibration(d.entries.main),n=bins.reduce((a,b)=>a+b.n,0);
  if(!n){add('p','Brak poprawnych rozliczonych prognoz.');return;}
  add('p','Próba: '+n+' unikalnych prognoz głównych z dostępnej listy; odrzucone niepoprawne lub powtórzone: '+rejected+'.');
  add('p','Brier: '+(bins.reduce((a,b)=>a+b.brier,0)/n).toFixed(4)+' · Log loss: '+(bins.reduce((a,b)=>a+b.loss,0)/n).toFixed(4));
  bins.forEach((b,i)=>{if(b.n)add('p',(i*10)+'–'+((i+1)*10)+'% | N='+b.n+' | prognoza '+(100*b.p/b.n).toFixed(1)+'% | wynik '+(100*b.y/b.n).toFixed(1)+'%'+(b.n<30?' · mała próba':''));});
  add('p','Audyt opisowy, nie kalibracja modelu. Dane obejmują tylko dostępną część archiwum; wyniki nie są niezależnie potwierdzane przez ten moduł.');
 }catch{el.textContent='Raport niedostępny, nieaktualny (ponad 12 godzin) lub niepoprawny. Nie wyświetlamy starych wskaźników jako bieżących.';}
});
})();
