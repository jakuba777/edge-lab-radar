'use strict';
/* Read-only report, same-origin only, no sportsbook connection or recommendation. */
const $=id=>document.getElementById(id);
const $t=(id,v)=>{$(id).textContent=String(v)};
const f=n=>Number.isFinite(n)?n.toFixed(5).replace('.',','):'—';
const fp=n=>Number.isFinite(n)?(n*100).toFixed(1).replace('.',',')+'%':'—';
const delta=n=>Number.isFinite(n)?((n>0)?'+':'')+f(n):'—';
const mk={o15:'Over 1,5',o25:'Over 2,5',u35:'Under 3,5',btts:'Obie strzelą',hg:'Gol gospodarzy',ag:'Gol gości'};
const el=(tag,txt,cl)=>{const x=document.createElement(tag);if(txt!==undefined)x.textContent=String(txt);if(cl)x.className=cl;return x;};
let cached=[];
async function getJSON(path){
 const response=await fetch(path,{cache:'no-cache',credentials:'omit',mode:'same-origin'});
 if(!response.ok)throw Error('Plik nie został opublikowany ('+response.status+'): '+path);
 return response.json();
}
function item(container,title,value){
 const node=el('div',undefined,'cmp-stat');node.appendChild(el('span',title));
 node.appendChild(el('b',value));container.appendChild(node);
}
function renderLive(){
 const selected=$('cmp-market').value;
 const root=$('cmp-live');root.replaceChildren();
 if(!cached.length){root.appendChild(el('div','Brak aktualnych, w pełni udokumentowanych spotkań.','panel empty'));return;}
 const top=cached.slice(0,24);
 for(const m of top){
  const old=Number(m.p_old?.[selected]),now=Number(m.p_new?.[selected]);
  if(!Number.isFinite(old)||!Number.isFinite(now))continue;
  const box=el('article',undefined,'cmp-match');
  box.appendChild(el('div',m.league+' · '+m.date,'date'));
  box.appendChild(el('h3',m.home+' – '+m.away));
  const vals=el('div',undefined,'values');
  for(const [name,value] of [['Poisson 0.4',old],['Eksperyment 0.5',now]]){
   const pane=el('div');pane.appendChild(el('small',name));pane.appendChild(el('strong',fp(value)));vals.appendChild(pane);
  }
  box.appendChild(vals);
  root.appendChild(box);
 }
}
async function load(){
 try{
  const report=await getJSON('./data/model05.json');
  if(report.status!=='ready'||!report.holdout?.markets||!report.holdout?.selected||!report.coverage?.test_matches)
   throw Error('Raport nie przeszedł kontroli minimalnej próby.');
  $t('cmp-state','Porównanie przeprowadzone');
  $t('cmp-source','Trening '+report.trained_on+' · niezależny test '+report.holdout+' · tylko wcześniejsze wyniki');
  // holdout is an object: use explicit season descriptor instead of coercion.
  $t('cmp-source','Trening: '+report.trained_on+' · Test: '+report.holdout.split_name?.holdout||'2025/26');
  $t('cmp-leagues',report.coverage.league_pairs);
  $t('cmp-matches',report.coverage.test_matches);
  const params=report.selected_parameters;
  $t('cmp-params','Parametry wybrane wyłącznie na 2024/25: półokres ważenia '+params.half_life_days+' dni; korekta ρ='+params.rho+'. Sprawdzono '+(report.training_grid?.length||0)+' z góry określonych kombinacji parametrów.');
  const gate=$('cmp-gate');gate.replaceChildren();
  const d=report.holdout.decision||{};
  const good=Boolean(d.eligible_for_promotion);
  gate.appendChild(el('div',good?'Eksperyment spełnił ustalone kryteria porównania. To jeszcze nie pozwala zmienić radaru bez testu przyszłych prognoz.':'Nie awansujemy modelu 0.5 do głównego radaru.', 'cmp-alert'+(good?' ok':'')));
  item(gate,'Rynki z niższym Brier niż model 0.4',(d.better_market_count??'—')+' / 6');
  item(gate,'Wymagane minimum',d.required_better_markets??'—');
  item(gate,'Lepsza główna selekcja?',d.better_selected?'Tak':'Nie');
  item(gate,'Lepsza niż prosta częstość ligi?',d.beats_simple_baseline?'Tak':'Nie');
  const table=$('cmp-markets');table.replaceChildren();
  const head=el('div',undefined,'cmp-grid');for(const q of ['Rynek / N','0.4','0.5','Baza','Δ'])head.appendChild(el('span',q));table.appendChild(head);
  for(const [id,name] of Object.entries(mk)){
   const row=report.holdout.markets[id];if(!row)continue;
   const div=el('div',undefined,'cmp-grid');
   div.appendChild(el('span',name+' · '+row.n));
   div.appendChild(el('span',f(row.old_brier)));
   div.appendChild(el('span',f(row.new_brier)));
   div.appendChild(el('span',f(row.baseline_brier)));
   div.appendChild(el('span',delta(row.delta_new_minus_old),row.delta_new_minus_old<0?'good':'bad'));
   table.appendChild(div);
  }
  const s=report.holdout.selected, sel=$('cmp-selected');sel.replaceChildren();
  item(sel,'Próbka',s.n+' meczów');
  item(sel,'Brier Poisson 0.4',f(s.old_brier));
  item(sel,'Brier eksperyment 0.5',f(s.new_brier));
  item(sel,'Brier prostej bazy',f(s.baseline_brier));
  item(sel,'Różnica 0.5 − 0.4',delta(s.delta_new_minus_old));
  const interval=s.descriptive_95pct_interval||[];
  if(interval.length===2)item(sel,'Orientacyjny zakres Δ 95%',f(interval[0])+' do '+f(interval[1]));
  try{
   const live=await getJSON('./data/model05_future.json');
   if(live.status!=='ready')throw Error('Dane przyszłych spotkań są nieaktualne.');
   cached=Array.isArray(live.predictions)?live.predictions:[];
   $t('cmp-live-meta','Zapis prognoz: '+live.created_utc.slice(0,16).replace('T',' ')+' UTC · '+cached.length+' przyszłych spotkań. Żadne późniejsze wyniki nie były uwzględnione.');
   renderLive();
  }catch(err){
   $t('cmp-live-meta',String(err.message||err));
   $('cmp-live').replaceChildren(el('div','Brak aktualnych prognoz.','panel empty'));
  }
 }catch(err){
  $t('cmp-state','Brak wiarygodnego raportu');
  $('cmp-error').classList.remove('hidden');$t('cmp-error',String(err.message||err));
  $('cmp-markets').replaceChildren(el('p','Nie prezentujemy fikcyjnych wyników.','caption'));
 }
}
document.addEventListener('DOMContentLoaded',()=>{$('cmp-market').addEventListener('change',renderLive);load();});