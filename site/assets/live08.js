'use strict';
/* EDGE LAB 0.8: NO LIVE scores. Render only explicitly labelled completed-match replay. */
(function(){
const $=id=>document.getElementById(id);
const el=(tag,text,cl)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(cl)x.className=cl;return x;};
const perc=v=>Number.isFinite(v)?(100*v).toFixed(1).replace('.',',')+'%':'—';
const score=v=>Number.isFinite(v)?v.toFixed(5).replace('.',','):'—';
const state={matches:[],minute:45,chosen:0};
function pair(box,a,b){
 const item=el('div');item.appendChild(el('small',a));item.appendChild(el('strong',String(b)));
 box.appendChild(item);
}
function fact(box,k,v){
 const row=el('div',undefined,'between');row.appendChild(el('span',k));
 row.appendChild(el('strong',v));box.appendChild(row);
}
function bar(box,p,baseline){
 const progress=el('progress',undefined,'live-progress'+(baseline?' baseline':''));
 progress.max=1;
 progress.value=Number.isFinite(p)?Math.max(0,Math.min(1,p)):0;
 progress.setAttribute('aria-label',baseline?'Prawdopodobieństwo metody bazowej':'Prawdopodobieństwo modelu');
 box.appendChild(progress);
}
function renderEval(result){
 const root=$('l08-eval');root.replaceChildren();
 const x=result.test_results;
 if(!x){root.appendChild(el('p','Brak wyników testu.'));return;}
 const metrics=el('div',undefined,'live-metrics');
 pair(metrics,'Brier modelu 0.8',score(x.brier_replay));
 pair(metrics,'Brier prostej metody',score(x.brier_baseline));
 root.appendChild(metrics);
 const check=Boolean(x.descriptive_sample_gate);
 let message;
 if(!check)message='Próba jest za mała (wymagamy minimum 500 meczów) do wiarygodnego wniosku. Nie oceniaj skuteczności modelu na podstawie kilku udanych sygnałów.';
 else if(x.brier_replay<x.brier_baseline)
  message='W tej próbie model poprawił Brier. Nadal wymaga większej, niezależnej weryfikacji i porównania z prawdziwymi kursami.';
 else message='W tej próbie model NIE poprawił przewidywań względem prostej metody bazowej. Nie traktujemy sygnałów jako okazji.';
 root.appendChild(el('div',message,'live-rating'+(check&&x.brier_replay<x.brier_baseline?' positive':'')));
 root.appendChild(el('p','Przetestowane mecze: '+x.test_matches+' · migawki: '+x.n+' · okna z golem: '+x.events+
  '. Ocena kolejnego gola w 15 minut, a nie wyniku meczu.'));
 root.appendChild(el('p','Mecze z jednej ligi i różne momenty tego samego meczu są zależne. Liczba obserwacji nie oznacza tylu niezależnych typów.'));
}
function renderReplay(){
 const root=$('l08-replay');root.replaceChildren();
 const match=state.matches[state.chosen];
 if(!match){root.appendChild(el('p','Brak meczów z pełnymi i zgodnymi minutami bramek.','caption'));return;}
 const frame=(match.frames||[]).find(x=>x.minute===state.minute);
 const head=el('div',undefined,'live-replay-head');
 const txt=el('div');
 txt.appendChild(el('small',match.league+' · '+match.date+' · MECZ ZAKOŃCZONY'));
 txt.appendChild(el('h3',match.home+' – '+match.away));
 head.appendChild(txt);
 head.appendChild(el('span',state.minute+'′','live-version'));root.appendChild(head);
 if(!frame){root.appendChild(el('p','Dla tego momentu brak wystarczającej liczby wcześniejszych spotkań.','caption'));return;}
 const stat=el('div',undefined,'live-replay-stats');
 pair(stat,'Łącznie goli do tej minuty',frame.goals_so_far);
 pair(stat,'Gole w ostatnich 15 minutach',frame.goals_last_15);
 root.appendChild(stat);
 const p=el('div',undefined,'live-prob');
 fact(p,'P(gol w następnych 15 min) · model',perc(frame.p_replay));bar(p,frame.p_replay,false);
 fact(p,'P(gol w następnych 15 min) · baza',perc(frame.p_baseline));bar(p,frame.p_baseline,true);
 root.appendChild(p);
 root.appendChild(el('p','Model: '+frame.history+' meczów z tej ligi rozegranych przed tym spotkaniem. Z podobnym tempem: '+frame.matched_history+
  '. Prognoza wykorzystuje wyłącznie bramki do wybranej minuty.','live-explanation'));
 const reveal=el('button','Odkryj, co wydarzyło się potem','live-reveal');
 reveal.type='button';
 reveal.addEventListener('click',()=>{
  reveal.disabled=true;reveal.textContent='Wynik okna został odkryty';
  root.appendChild(el('div',(frame.has_goal_next_15?'W następnych 15 minutach PADŁ gol.':'W następnych 15 minutach NIE PADŁ gol.')+
    ' W całym zakończonym meczu padło '+match.fulltime_total_goals+' goli. Wcześniejsza prognoza nie korzystała z tego rezultatu.','live-outcome'));
 });
 root.appendChild(reveal);
}
async function load(){
 try{
  const r=await fetch('./data/live08_replay.json',{cache:'no-store',credentials:'omit',mode:'same-origin'});
  if(!r.ok)throw Error('Brak opublikowanego raportu (HTTP '+r.status+').');
  const data=await r.json();
  if(data.mode!=='REPLAY_ONLY_NOT_LIVE'||!Array.isArray(data.all_leagues)||!Array.isArray(data.replays)||!data.test_results)
   throw Error('Niewłaściwy lub niekompletny raport. Symulacja wyłączona.');
  state.matches=data.replays;
  $('l08-state').textContent='Odtwarzanie historycznych zdarzeń';
  $('l08-updated').textContent='Opracowano: '+data.created_utc.slice(0,16).replace('T',' ')+' UTC. Dane źródłowe nie są LIVE.';
  $('l08-leagues').textContent=String(data.all_leagues.filter(x=>x.status==='usable').length);
  $('l08-test').textContent=String(data.test_results.test_matches||0);
  $('l08-matches').textContent=String(data.replays.length);
  renderEval(data);
  const sel=$('l08-match');sel.replaceChildren();
  data.replays.forEach((x,i)=>{
    const option=el('option',x.date+' · '+x.home+' – '+x.away+' · '+x.league);
    option.value=String(i);sel.appendChild(option);
  });
  if(!data.replays.length){
    const option=el('option','Brak zgodnych danych');option.value='';sel.appendChild(option);
  }
  renderReplay();
 }catch(e){
  $('l08-state').textContent='Odtwarzanie niedostępne';
  $('l08-error').classList.remove('hidden');$('l08-error').textContent=String(e.message||e);
  $('l08-replay').replaceChildren(el('p','Nie pokazujemy niezweryfikowanych minut bramek ani sztucznych wyników.','caption'));
 }
}
document.addEventListener('DOMContentLoaded',()=>{
 $('l08-match').addEventListener('change',v=>{state.chosen=Number(v.target.value);renderReplay();});
 document.querySelectorAll('[data-minute]').forEach(button=>button.addEventListener('click',()=>{
  state.minute=Number(button.dataset.minute);
  document.querySelectorAll('[data-minute]').forEach(b=>{
    const active=b===button;b.classList.toggle('is-active',active);
    b.setAttribute('aria-pressed',String(active));
  });
  renderReplay();
 }));
 load();
});
})();