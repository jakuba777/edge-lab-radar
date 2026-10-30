'use strict';
(function(){
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(cls)x.className=cls;return x;};
const marketNames={o15:'Powyżej 1,5',o25:'Powyżej 2,5',u35:'Poniżej 3,5',btts:'Obie strzelą'};
const htNames={'2/1':'Łamak 2/1','1/2':'Łamak 1/2'};
const profiles={selective:'Selektywny',balanced:'Balans',contrarian:'Kontrariański',builder:'Bet Builder'};
const labels={hit:'WESZŁO',miss:'NIE WESZŁO',pending:'OCZEKUJE'};
const pct=x=>typeof x==='number'?(x*100).toFixed(1).replace('.',',')+'%':'—';
const brier=x=>typeof x==='number'?x.toFixed(5).replace('.',','):'—';
let report=null;
function line(root,values,heading=false){
 const row=el('div',undefined,'track-line'+(heading?' track-heading':''));
 values.forEach((v,i)=>row.appendChild(el('span',v,i===0?'track-label':'')));
 root.appendChild(row);
}
function statCards(container,rec){
 const root=$(container);root.replaceChildren();
 const items=[
  ['Trafione',rec.hit||0,true],['Nietrafione',rec.miss||0,false],
  ['Skuteczność rozliczonych',pct(rec.hit_rate),true],
  ['Oczekujące',rec.pending||0,false]
 ];
 for(const [title,value,good] of items){
  const card=el('div',undefined,'track-stat');
  card.appendChild(el('small',title));
  card.appendChild(el('strong',value,good?'good':''));
  if(title==='Skuteczność rozliczonych'){
   card.appendChild(el('p',rec.scored?'Weryfikacja '+rec.scored+' zdarzeń':'Za mało potwierdzonych wyników'));
  }
  root.appendChild(card);
 }
}
function marketTables(){
 for(const [target,names,data] of [
  ['track-market',marketNames,report.summary.market_probabilities],
  ['track-halftime',htNames,report.summary.halftime_research]
 ]){
  const root=$(target);root.replaceChildren();
  line(root,['Rynek','Weszło','Próba','Brier'],true);
  for(const [id,name] of Object.entries(names)){
   const r=(data||{})[id]||{};
   line(root,[name,String(r.hit||0),String(r.scored||0),brier(r.brier)]);
  }
 }
}
function stateTag(status){
 return el('span',labels[status]||'—','track-state '+status);
}
function simpleEntry(m,half){
 const card=el('article',undefined,'track-entry');
 const title=el('div',undefined,'track-entry-top');
 const desc=el('div');
 desc.appendChild(el('div',m.league+' · '+m.date,'sub'));
 desc.appendChild(el('h3',m.home+' – '+m.away));
 title.appendChild(desc);title.appendChild(stateTag(m.state));
 card.appendChild(title);
 card.appendChild(el('div',(half?htNames[m.market]:m.label||m.market)+' · P modelowe '+pct(m.p),'market'));
 card.appendChild(el('div',m.score?'Wynik końcowy: '+m.score:'Brak potwierdzonego wyniku','score'));
 card.appendChild(el('div','Zapisano: '+m.snapshot_utc.slice(0,16).replace('T',' ')+' UTC','sub'));
 if(half&&m.state==='pending')card.appendChild(el('div','Wynik do przerwy może być niepotwierdzony.','sub'));
 return card;
}
function couponEntry(m){
 const card=el('article',undefined,'track-entry');
 const title=el('div',undefined,'track-entry-top');
 const desc=el('div');
 desc.appendChild(el('div','Symulacja · '+(profiles[m.profile]||m.profile),'sub'));
 desc.appendChild(el('h3',m.legs.length+' zdarzenia · łączne P '+pct(m.p)));
 title.appendChild(desc);title.appendChild(stateTag(m.state));card.appendChild(title);
 const list=el('div',undefined,'track-legs');
 for(const leg of m.legs){
  const row=el('div',undefined,'track-leg');
  const part=el('div');
  part.appendChild(el('small',leg.date+' · '+leg.home+' – '+leg.away));
  part.appendChild(el('div',leg.label+' · '+pct(leg.p),'market'));
  row.appendChild(part);row.appendChild(stateTag(leg.state));list.appendChild(row);
 }
 card.appendChild(list);
 card.appendChild(el('div','Archiwum: '+m.snapshot_utc.slice(0,16).replace('T',' ')+' UTC. To nie jest rzeczywiście zawarty kupon.','sub'));
 return card;
}
function showHistory(){
 if(!report)return;
 const kind=$('track-kind').value,filter=$('track-filter').value;
 const source=kind==='main'?report.entries.main:kind==='coupons'?report.entries.simulated_coupons:report.entries.halftime_research;
 let rows=Array.isArray(source)?[...source]:[];
 if(filter!=='all')rows=rows.filter(x=>x.state===filter);
 const dateKey=x=>x.date||(Array.isArray(x.legs)&&x.legs.length?x.legs.map(l=>l.date).sort()[0]:'');
 rows.sort((a,b)=>{
  if(filter==='all'&&a.state!==b.state){if(a.state==='pending')return -1;if(b.state==='pending')return 1;}
  return a.state==='pending'&&b.state==='pending'?dateKey(a).localeCompare(dateKey(b)):dateKey(b).localeCompare(dateKey(a));
 });
 const root=$('track-history');root.replaceChildren();
 if(!rows.length){
  root.appendChild(el('div','Brak potwierdzonych wpisów dla tego filtra. Nie uzupełniamy historii domysłami.','panel track-empty'));return;
 }
 for(const row of rows.slice(0,60))root.appendChild(kind==='main'?simpleEntry(row,false):kind==='coupons'?couponEntry(row):simpleEntry(row,true));
}
async function main(){
 try{
  const response=await fetch('./data/track_record.json',{credentials:'omit',mode:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('Raport niedostępny (HTTP '+response.status+').');
  const data=await response.json();
  if(data.status!=='ready'||!data.summary?.main||!data.entries?.main)throw Error('Raport niekompletny.');
  if(!data.updated_utc||!Number.isFinite(Date.parse(data.updated_utc)))throw Error('Raport bez poprawnej daty aktualizacji.');
  const ageHours=(Date.now()-Date.parse(data.updated_utc))/3600000;
  if(ageHours < -1)throw Error('Data raportu jest w przyszłości — sprawdź synchronizację.');
  report=data;
  $('track-error').classList.add('hidden');
  $('track-state').textContent=ageHours>48?'Archiwum nieaktualne':'Archiwum aktywne';
  $('track-date').textContent='Aktualizacja: '+data.updated_utc.slice(0,16).replace('T',' ')+' UTC · rozliczamy tylko daty przed '+data.settle_only_dates_before_warsaw+'.';
  $('track-archives').textContent=String(data.artifacts_checked||0);
  $('track-total').textContent=String(data.counts?.forecast_matches||0);
  $('track-scored').textContent=String(data.summary.main.scored||0);
  statCards('track-main-metrics',data.summary.main);
  statCards('track-coupons-metrics',data.summary.simulated_coupons||{});
  marketTables();showHistory();
  if(ageHours>48){
   $('track-error').classList.remove('hidden');
   $('track-error').textContent='Uwaga: ostatnia aktualizacja ponad 48 godzin temu. Pokazane liczby są historyczne, nie bieżące.';
  }
  if(data.artifact_errors||data.conflicting_results){
   $('track-error').classList.remove('hidden');
   $('track-error').textContent='Nieodczytane archiwa: '+(data.artifact_errors||0)+'. Niezgodne wyniki: '+(data.conflicting_results||0)+'.';
  }
 }catch(e){
  $('track-state').textContent='Raport nie jest gotowy';
  $('track-error').classList.remove('hidden');$('track-error').textContent=String(e?.message||e);
  $('track-main-metrics').replaceChildren(el('div','Brak wiarygodnych rozliczeń.','panel track-empty'));
  $('track-history').replaceChildren(el('div','Nie prezentujemy fikcyjnej skuteczności.','panel track-empty'));
 }
}
document.addEventListener('DOMContentLoaded',()=>{
 $('track-kind').addEventListener('change',showHistory);
 $('track-filter').addEventListener('change',showHistory);
 main();
});
})();