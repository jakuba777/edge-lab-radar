'use strict';
const $=id=>document.getElementById(id);
const marketNames={o15:'Powyżej 1,5 gola',o25:'Powyżej 2,5 gola',u35:'Poniżej 3,5 gola',btts:'Obie strzelą',hg:'Gol gospodarzy',ag:'Gol gości'};
const fmt=x=>typeof x==='number'?x.toFixed(4).replace('.',','):'—';
const delta=x=>typeof x==='number'?(x>0?'+':'')+fmt(x):'—';
const set=(id,s)=>{$(id).textContent=s;};
function elt(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;}
function addRow(where,labels,header=false){
 const row=elt('div',undefined,'audit-row'+(header?' audit-header':''));for(const label of labels)row.appendChild(elt('span',label));where.appendChild(row);
}
async function load(){
 try{
 const r=await fetch('./data/backtest.json',{cache:'no-cache',credentials:'omit',mode:'same-origin'});
 if(!r.ok)throw Error('Brak raportu w publikacji (HTTP '+r.status+').');
 const d=await r.json();
 if(!d||!d.coverage||!d.overall)throw Error('Raport jest niekompletny.');
 const ready=d.status==='ready';
 set('audit-status',ready?'Test historyczny wykonany':'Za mało dostępnych danych');
 set('audit-source','Źródło: football-data.co.uk · sezony '+(d.seasons||[]).join(', ')+' · aktualizacja '+(d.updated_utc||'—').slice(0,16).replace('T',' ')+' UTC');
 set('audit-series',(d.coverage.downloaded_seasons||0)+' zbiorów');
 set('audit-matches',String(d.coverage.eligible_matches||0));
 if(!ready){
 const a=elt('p',d.notice||'Za mało wiarygodnych wyników do porównania.','error-box');$('audit-warnings').appendChild(a);
 }
 if(Array.isArray(d.errors)&&d.errors.length){
 const a=elt('p','Niepobrane lub odrzucone zbiory: '+d.errors.length+'. Szczegóły w kodzie raportu.','caption');
 $('audit-warnings').appendChild(a);
 }
 const markets=$('markets');markets.replaceChildren();addRow(markets,['Rynek / N','Model','Baza','Δ'],true);
 for(const key of ['o15','o25','u35','btts','hg','ag']){
  const x=d.overall[key];if(!x)continue;
  const row=elt('div',undefined,'audit-row');
  row.appendChild(elt('span',marketNames[key]+' · '+x.n));
  row.appendChild(elt('span',fmt(x.brier)));
  row.appendChild(elt('span',fmt(x.baseline_brier)));
  const changes=elt('span',delta(x.delta_brier));changes.className='delta '+(x.delta_brier<0?'positive':'negative');
  row.appendChild(changes);markets.appendChild(row);
 }
 const s=d.selected||{};
 const selected=$('selected');selected.replaceChildren();
 selected.appendChild(elt('p','Test tej samej selekcji, którą radar stosuje do wybierania jednego rynku bramkowego na mecz.','caption'));
 addRow(selected,['Liczba meczów',s.n||0]);
 addRow(selected,['Brier modelu',fmt(s.brier)]);
 addRow(selected,['Brier metody bazowej',fmt(s.baseline_brier)]);
 addRow(selected,['Różnica (model - baza)',delta(s.delta_brier)]);
 addRow(selected,['Śr. prognoza / faktyczna częstość',typeof s.mean_predicted==='number'?Math.round(s.mean_predicted*100)+'% / '+Math.round(s.observed*100)+'%':'—']);
 if(typeof s.delta_brier==='number')selected.appendChild(elt('p',s.delta_brier<0?'W tym teście selekcja była dokładniejsza od częstości ligowej, ale to nie oznacza przewagi kursowej.':'W tym teście selekcja nie poprawiła bazowego przewidywania częstości ligowej.','caption'));
 const leagues=$('leagues');leagues.replaceChildren();
 for(const e of d.leagues||[]){
  const sec=elt('section',undefined,'panel');sec.appendChild(elt('h3',e.league+' · '+e.season));
  sec.appendChild(elt('p','Przetestowano '+e.evaluated+' z '+e.matches+' zakończonych spotkań.','caption'));
  const k=e.markets?.o25;
  if(k){addRow(sec,['Over 2,5: model',fmt(k.brier)]);addRow(sec,['Over 2,5: baza',fmt(k.baseline_brier)]);}
  leagues.appendChild(sec);
 }
 if(!d.leagues?.length)leagues.appendChild(elt('div','Brak danych historycznych.','panel'));
 }catch(err){
 set('audit-status','Nie udało się pobrać raportu.');
 $('audit-warnings').appendChild(elt('p',String(err.message||err),'error-box'));
 }
}
document.addEventListener('DOMContentLoaded',load);