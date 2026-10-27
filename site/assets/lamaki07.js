'use strict';
(function(){
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node;};
let future=[];
function p(x){return Number.isFinite(x)?(100*x).toFixed(2).replace('.',',')+'%':'—';}
function metric(x){return Number.isFinite(x)?x.toFixed(6).replace('.',','):'—';}
async function fetchJSON(name){
 const r=await fetch('./data/'+name,{cache:'no-store',credentials:'omit',mode:'same-origin'});
 if(!r.ok)throw Error(name+' HTTP '+r.status);
 return r.json();
}
function addStat(box,k,v){
 const row=make('div',undefined,'ht-row');row.appendChild(make('span',k));
 row.appendChild(make('strong',v));box.appendChild(row);
}
function scores(report){
 const result=$('ht07-scores');result.replaceChildren();
 for(const type of ['2/1','1/2']){
  const m=report.market_results[type]||{},box=make('article',undefined,'panel ht-card');
  box.appendChild(make('h3','Scenariusz '+type+' — '+(m.n||0)+' sprawdzonych meczów'));
  addStat(box,'Zaobserwowane zdarzenia',m.events??'—');
  addStat(box,'Średnia prognoza modelu',p(m.predicted_mean));
  addStat(box,'Faktyczna częstość',p(m.actual_frequency));
  addStat(box,'Brier modelu',metric(m.brier_model));
  addStat(box,'Brier prostej częstości ligi',metric(m.brier_baseline));
  addStat(box,'Brier: różnica model − baza',metric(m.delta_brier));
  addStat(box,'Log-loss modelu',metric(m.logloss_model));
  addStat(box,'Log-loss bazy',metric(m.logloss_baseline));
  box.appendChild(make('p',report.status==='evaluable'
    ?'Wyniki historyczne są dostępne, ale wciąż nie potwierdzają przewagi kursowej ani przyszłej skuteczności.'
    :'Próba jest zbyt mała według z góry określonych warunków. Nie podejmujemy decyzji o jakości modelu.','caption'));
  result.appendChild(box);
 }
}
function renderCandidates(){
 const root=$('ht07-candidates');root.replaceChildren();
 const kind=$('ht07-kind').value;
 const top=[...future].filter(x=>Number.isFinite(x.p?.[kind])&&x.p[kind]>=0&&x.p[kind]<=1)
  .sort((a,b)=>b.p[kind]-a.p[kind]||a.date.localeCompare(b.date)).slice(0,12);
 $('ht07-candidates-info').textContent='Dostępne prognozy: '+future.length+
  ' · pokazujemy do 12 najwyższych wartości MODELowych dla '+kind+
  '. Wysoki procent nie oznacza przewagi ani dobrej ceny zakładu.';
 if(!top.length){
  root.appendChild(make('div','Brak nadchodzących spotkań z wystarczającą liczbą danych. Nie generujemy fikcyjnych łamaków.','panel empty'));return;
 }
 for(const match of top){
  const box=make('article',undefined,'panel ht-card');
  box.appendChild(make('div',match.league+' · '+match.date,'kicker'));
  box.appendChild(make('h3',match.home+' – '+match.away));
  addStat(box,'Eksperymentalna szansa '+kind,p(match.p[kind]));
  addStat(box,'Próba: gospodarz u siebie / gość na wyjeździe',match.n_home+' / '+match.n_away);
  box.appendChild(make('p','Status: kandydat do dalszej analizy, nie typ. Nie oceniliśmy kursu, formy LIVE ani kalibracji.','caption'));
  root.appendChild(box);
 }
}
async function main(){
 try{
  const report=await fetchJSON('ht07_backtest.json');
  if(!report||!report.market_results||!report.created_utc)throw Error('Raport ma niepełne pola.');
  $('ht07-state').textContent=report.status==='evaluable'?
   'Test historyczny zarejestrowany':'Za mało zaobserwowanych łamaków';
  $('ht07-count').textContent=String(report.matches_evaluated||0);
  $('ht07-events').textContent=String(report.observed_breaks||0);
  $('ht07-note').textContent='Test od '+report.test_start+
   ' · '+(report.evaluated_leagues||0)+' lig · liczby nie są potwierdzeniem przewagi.';
  scores(report);
  if(report.status!=='evaluable'){
   $('ht07-error').classList.remove('hidden');
   $('ht07-error').textContent='Rzadkie zdarzenie wymaga większej próby: co najmniej '+
    report.statistical_gate.min_holdout_matches+' meczów i '+
    report.statistical_gate.min_observed_breaks+
    ' łamaków. Dotychczasowe pomiary są wstępne.';
  }
  const futureData=await fetchJSON('ht07_future.json');
  const age=(Date.now()-Date.parse(futureData.created_utc))/3600000;
  if(futureData.status!=='research_only'||!Number.isFinite(age)||age<0||age>48){
   future=[]; $('ht07-candidates-info').textContent='Brak świeżego, bezpiecznego źródła prognoz.';
  }else future=Array.isArray(futureData.predictions)?futureData.predictions:[];
  renderCandidates();
 }catch(e){
  $('ht07-state').textContent='Nie udało się pobrać raportu 0.7';
  $('ht07-error').classList.remove('hidden');
  $('ht07-error').textContent=String(e.message||e);
  $('ht07-scores').replaceChildren(make('div','Nie pokazujemy niezweryfikowanych wyników.','panel empty'));
  $('ht07-candidates').replaceChildren(make('div','Brak aktualnych prognoz.','panel empty'));
 }
}
document.addEventListener('DOMContentLoaded',()=>{
 $('ht07-kind').addEventListener('change',renderCandidates);
 main();
});
})();