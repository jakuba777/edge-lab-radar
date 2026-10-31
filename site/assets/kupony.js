'use strict';
/* EDGE LAB 0.6 — offline-capable static UI: no login, no live odds, no bookmaker links. */
(function(){
 const C=window.EDGECOUPONS;
 const W=window.EDGEWINDOW;
 if(!C||!W)throw Error('Coupon or Warsaw-time guard missing');
 const $=id=>document.getElementById(id);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Warsaw'}).format(new Date());
 const state={matches:[],leagues:[],coupons:[],loaded:false,profile:'selective',stale:true,sourceUTC:null};
 const sourceAge=()=>state.sourceUTC?(Date.now()-Date.parse(state.sourceUTC))/3600000:Infinity;
 const kickoff=m=>{const t=String(m.time||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);const n=t&&+t[1]<24&&+t[2]<60?+t[1]*60+(+t[2]):1440;return m.date+' '+String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
 const chronological=(a,b)=>W.sortKey(a).localeCompare(W.sortKey(b));
 const descriptions={
   selective:'Wyższe szacunki modelu, ale to nie są „pewniaki” ani sprawdzone przewagi rynkowe.',
   single:'Pojedyncze zdarzenie do badania. Weryfikowane oddzielnie od wielozdarzeniowych symulacji.',
   balanced:'Kilka rynków, różne spotkania, próba uniknięcia powtórzeń. Brak dowodu rentowności.',
   contrarian:'Model odstaje od historycznej częstości ligi. „Czutka” jest hipotezą, nie algorytmem przewagi nad kursami.',
   builder:'Wspólne zdarzenia jednego meczu policzone z tej samej siatki wyników.',
   high_odds:'Badamy wyższe modelowe kursy progowe: mniejsza szansa powodzenia, bez dostępnych kursów Superbet i bez potwierdzonej przewagi.'
 };
 const profileLabels={high_odds:'Wyższe kursy',single:'Pojedyncze',selective:'Selektywny',balanced:'Balans',contrarian:'Kontrariański',builder:'Bet Builder'};
 const fjson=async path=>{
  const r=await fetch(path,{cache:'no-store',credentials:'omit',mode:'same-origin'});
  if(!r.ok)throw Error('Błąd HTTP '+r.status+' przy '+path);
  return r.json();
 };
 const ftxt=async path=>{
  const r=await fetch(path,{cache:'no-store',credentials:'omit',mode:'same-origin'});
  if(!r.ok)throw Error('Błąd HTTP '+r.status+' przy '+path);
  return r.text();
 };
 function setFailure(msg){
  $('coupon-failure').classList.remove('hidden');
  $('coupon-failure').textContent=msg;
 }
 async function load(){
  state.loaded=false;state.stale=true;state.sourceUTC=null;
  $('coupon-failure').classList.add('hidden');
  $('coupon-state').textContent='Sprawdzam dane sportowe…';
  $('coupon-reload').disabled=true;
  try{
   const status=await fjson('./data/status.json');
   if(!Array.isArray(status.leagues)||!status.leagues.length||!status.retrieved_at_utc)throw Error('Brak listy zweryfikowanych źródeł.');
   const age=(Date.now()-Date.parse(status.retrieved_at_utc))/3600000;
   if(!Number.isFinite(age)||age<0||age>48)throw Error('Źródła starsze niż 48 godzin. Generowanie kuponów jest wstrzymane.');
   const attempts=await Promise.allSettled(status.leagues.map(async league=>{
    if(!/^[A-Za-z0-9_-]+$/.test(league.id))throw Error('Niewłaściwa nazwa katalogu źródła');
    const dir='./data/'+league.id+'/';
    const [rawResults,rawFixtures]=await Promise.all([ftxt(dir+'results_2627.csv'),ftxt(dir+'fixtures_2627.csv')]);
    const hist=C.parseCSV(rawResults);
    const events=C.parseCSV(rawFixtures);
    if(!hist.length||!events.length||!['date','home','away','ft_home','ft_away'].every(k=>Object.hasOwn(hist[0],k))||
       !['date','home','away'].every(k=>Object.hasOwn(events[0],k)))throw Error('Niekompletny schemat CSV');
    const history=hist.filter(r=>C.validDate(r.date)&&r.home&&r.away&&C.n(r.ft_home)!==null&&C.n(r.ft_away)!==null)
     .map(r=>({date:r.date,home:r.home,away:r.away,hs:C.n(r.ft_home),as:C.n(r.ft_away)}))
     .filter(r=>r.hs>=0&&r.as>=0&&r.hs<=14&&r.as<=14).sort((a,b)=>a.date.localeCompare(b.date));
    const seen=new Set(),matches=[];
    for(const f of events){
     if(!C.validDate(f.date)||!f.home||!f.away||f.home===f.away)continue;
     const id=[league.id,f.date,f.home,f.away].join('|');
     if(seen.has(id))continue;seen.add(id);
     matches.push({id,date:f.date,home:f.home,away:f.away,leagueId:league.id,league:league.name,
      time:f.time||'',model:C.analyze(f,history),
      exploratoryModel:f.date===today()?C.analyze(f,history,{exploratory:true}):null});
    }
    return {league,matches};
   }));
   const valid=attempts.filter(x=>x.status==='fulfilled').map(x=>x.value);
   if(!valid.length)throw Error('Brak kompletnych źródeł danych — nie układamy fikcyjnych zestawień.');
   state.matches=valid.flatMap(x=>x.matches);
   state.leagues=valid.map(x=>x.league);
   state.stale=false;state.loaded=true;state.sourceUTC=status.retrieved_at_utc;
   $('coupon-state').textContent='Dane wczytane · nie LIVE';
   $('coupon-updated').textContent='Pobrano '+new Date(status.retrieved_at_utc).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'})+' · brak gwarancji terminarza';
   $('coupon-leagues').textContent=String(valid.length);
   const next=state.matches.filter(m=>C.daysBetween(m.date,today())>=0&&C.daysBetween(m.date,today())<=14&&W.eligible(m,new Date(),sourceAge()));
   $('coupon-fixtures').textContent=String(next.length);
   $('coupon-ready').textContent=String(next.filter(m=>m.model).length);
   const missed=attempts.length-valid.length;
   if(missed)setFailure(missed+' źródeł nie przeszło kontroli. Nie uwzględniono ich w wynikach.');
   const select=$('coupon-league'),prior=select.value;
   select.innerHTML='<option value="all">Wszystkie dostępne</option>'+state.leagues.map(l=>
     '<option value="'+escape(l.id)+'">'+escape(l.name)+'</option>').join('');
   if([...select.options].some(x=>x.value===prior))select.value=prior;
   updateDayOptions();render();renderTodayExplorer();
  }catch(e){
   $('coupon-state').textContent='Źródła niedostępne';
   setFailure(String(e?.message||e));
   $('coupon-leagues').textContent='0';
   $('coupon-fixtures').textContent='0';
   $('coupon-ready').textContent='0';
   $('coupon-cards').innerHTML='<div class="coupon-nothing">Nie mamy aktualnych danych. Nie generujemy sztucznych zestawień. Sprawdź synchronizację GitHub Actions.</div>';
   $('coupon-number').textContent='0';
   $('coupon-day').replaceChildren(new Option('Brak dostępnych terminów',''));
   $('coupon-day').disabled=true;
   $('coupon-evening-count').textContent='—';
   $('coupon-evening').textContent='Brak wiarygodnych danych do dzisiejszych badań.';
  }finally{$('coupon-reload').disabled=false;}
 }
 function fixtureWindow(){
  const days=Number($('coupon-days').value)||14;
  const league=$('coupon-league').value;
  const now=new Date(),age=sourceAge();
  return state.matches.filter(m=>C.daysBetween(m.date,today())>=0&&C.daysBetween(m.date,today())<=days
   &&(league==='all'||m.leagueId===league)
   &&(m.date!==today()||$('coupon-include-today').checked)
   &&W.eligible(m,now,age)).sort(chronological);
 }
 function formatDay(day){
  const d=new Date(day+'T12:00:00Z');
  return new Intl.DateTimeFormat('pl-PL',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(d);
 }
 function updateDayOptions(){
  const select=$('coupon-day'),previous=select.value;
  const matches=fixtureWindow(),stats=new Map();
  for(const m of matches){
   const x=stats.get(m.date)||{fixtures:0,model:0};
   x.fixtures++;if(m.model)x.model++;stats.set(m.date,x);
  }
  const days=[...stats.keys()].sort();
  select.replaceChildren();
  if(!days.length){
   select.appendChild(new Option('Brak dostępnych dni w tym filtrze',''));
   select.disabled=true;
   $('coupon-day-info').textContent='Brak spotkań z aktualnego terminarza dla wybranych filtrów.';
   return;
  }
  select.disabled=false;
  for(const date of days){
   const data=stats.get(date);
   const caption=(date===today()?'Dzisiaj · ':'')+formatDay(date)+
    ' · '+data.model+' z modelem / '+data.fixtures+' meczów';
   select.appendChild(new Option(caption,date));
  }
  select.appendChild(new Option('Wszystkie dni — łącz spotkania z całego zakresu','all'));
  if([...select.options].some(o=>o.value===previous))select.value=previous;
  else {
   const minCount=state.profile==='single'||state.profile==='builder'?1:
     Number($('coupon-count').value)||2;
   select.value=days.find(day=>stats.get(day).model>=minCount)||
    days.find(day=>stats.get(day).model>0)||days[0];
  }
  $('coupon-day-info').textContent=select.value==='all'?
   'Tryb całego zakresu: kupony mogą łączyć mecze z różnych dni.':
   'Wybrany dzień: '+formatDay(select.value)+'. Z modelem '+stats.get(select.value).model+
    ' z '+stats.get(select.value).fixtures+' meczów. Wszystkie zdarzenia symulacji pochodzą z tej daty.';
 }
 function matchFilter(){
  const day=$('coupon-day').value;
  return C.forSelectedDay(fixtureWindow().filter(m=>m.model),day);
 }
 function renderTodayExplorer(){
  const root=$('coupon-evening');
  if(!root)return;
  if(!state.loaded||state.stale){
   root.textContent='Źródła niedostępne. Nie wyświetlamy prognoz.';
   return;
  }
  const remaining=state.matches.filter(m=>m.date===today()
     &&W.status(m,new Date(),sourceAge())==='today_remaining_unverified_time_zone')
     .sort(chronological);
  const researched=remaining.filter(m=>m.exploratoryModel);
  $('coupon-evening-count').textContent=researched.length+' analiz';
  if(!remaining.length){
   root.innerHTML='<div class="coupon-nothing">Brak dalszych meczów z wiarygodną godziną w świeżym terminarzu. Możesz sprawdzić jutro, bez wymuszania typów.</div>';
   return;
  }
  if(!researched.length){
   root.innerHTML='<div class="coupon-nothing">Pozostałe dzisiaj: '+remaining.length+' spotkań, ale brak modelu nawet przy obniżonej próbie 4/4. Nie zgadujemy prawdopodobieństw.</div>';
   return;
  }
  root.innerHTML=researched.slice(0,14).map(m=>{
   const model=m.exploratoryModel;
   const status=model.exploratory?'MAŁA PRÓBA · TEST':'STANDARDOWA PRÓBA · TEST';
   const type='ŹRÓDŁOWA GODZINA · WYMAGA POTWIERDZENIA';
   return '<article class="coupon-evening-card">'+
    '<div class="coupon-evening-head"><div><small>'+escape(m.league)+' · '+escape(m.time)+' · '+type+'</small>'+
    '<strong>'+escape(m.home)+' – '+escape(m.away)+'</strong></div><span class="coupon-pill">'+status+'</span></div>'+
    '<div class="coupon-evening-probs">'+
    '<div><small>Powyżej 1,5</small><strong>'+C.fmtP(model.ps.o15)+'</strong></div>'+
    '<div><small>Poniżej 3,5</small><strong>'+C.fmtP(model.ps.u35)+'</strong></div>'+
    '<div><small>Obie strzelą</small><strong>'+C.fmtP(model.ps.btts)+'</strong></div></div>'+
    '<p class="caption">Próba '+model.nH+' dom / '+model.nA+' wyjazd. Trzy oszacowania tego samego meczu, nie niezależne typy. Nie znamy kursu.</p>'+
    '<button type="button" class="coupon-evening-copy" data-evening-copy="'+escape(m.id)+'">Skopiuj obserwację do notatek</button></article>';
  }).join('');
 }
 async function copyTodayResearch(id,button){
  const m=state.matches.find(x=>x.id===id&&x.date===today());
  if(!m||!m.exploratoryModel||W.status(m,new Date(),sourceAge())!=='today_remaining_unverified_time_zone'){
   button.textContent='Termin minął lub dane nieaktualne';return;
  }
  const p=m.exploratoryModel;
  const note=['EDGE LAB · zapis lokalny (niezależnie niezweryfikowany)',
   'Zapisano '+new Date().toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'}),
   m.date+' '+m.time+' (godzina źródłowa, niepotwierdzona)',
   m.home+' – '+m.away+' · '+m.league,
   'Model eksperymentalny: P(>1,5) '+C.fmtP(p.ps.o15),
   'P(<3,5) '+C.fmtP(p.ps.u35),
   'P(BTTS) '+C.fmtP(p.ps.btts),
   'Próba '+p.nH+' / '+p.nA,
   'Nie jest to potwierdzone prognozowanie ani kupon. Godzinę należy zweryfikować.'].join('\n');
  try{await navigator.clipboard.writeText(note);button.textContent='Skopiowano';}
  catch(_){button.textContent='Kopiowanie niedostępne';}
 }
 function profileName(type,count){return type==='single'?'1 zdarzenie / badanie':type==='builder'?'Scenariusz jednego meczu':count+' mecze / '+profileLabels[type];}
 function renderCard(c,i){
  const multi=c.type==='separate';
  const legs=c.legs.map((x,j)=>{
   const match=x.match;
   const contrast=c.profile==='contrarian'?'<div class="minor">Różnica wobec częstości ligi: '+(x.diff>0?'+':'')+((x.diff||0)*100).toFixed(1).replace('.',',')+' pkt proc.</div>':'';
   return '<div class="coupon-leg"><div><div class="minor">ZDARZENIE '+(j+1)+' · '+escape(match.league)+' · '+escape(match.date)+(match.time?' · '+escape(match.time):'')+'</div>'+
    '<div class="teams">'+escape(match.home)+' – '+escape(match.away)+'</div><div class="market">'+escape(x.label)+'</div>'+
    '<div class="minor">Próba: '+match.model.nH+' dom / '+match.model.nA+' wyjazd</div>'+contrast+'</div>'+
    '<div class="prob">'+C.fmtP(x.p)+'</div></div>';
  }).join('');
  const math=c.type==='single'?'Jedno zdarzenie bez łączenia wyników wielu spotkań.':multi?'Iloczyn szacunków dla różnych spotkań (przybliżenie niezależności).':
   'Wspólne prawdopodobieństwo dwóch zdarzeń wyliczone łącznie, z korelacją.';
  return '<article class="coupon-card">'+
   '<div class="coupon-cardhead"><div><div class="eyebrow">WARIANT '+String(i+1).padStart(2,'0')+' · '+escape(profileLabels[c.profile])+'</div>'+
   '<h3>'+escape(profileName(c.profile,c.legs.length))+'</h3></div><span class="coupon-pill">HIPOTEZA</span></div>'+
   '<div class="coupon-leglist">'+legs+'</div>'+
   '<div class="coupon-metrics"><div class="coupon-metric"><small>Prawdopodobieństwo modelowe</small><strong class="light">'+C.fmtP(c.p)+'</strong></div>'+
   '<div class="coupon-metric"><small>Próg kursu przy podatku 12%*</small><strong>'+C.fmt(c.requiredOdds)+'</strong></div></div>'+
   '<p class="coupon-truth">'+escape(math)+' Modelowe ryzyko nietrafienia całego zestawienia: '+C.fmtP(1-c.p)+'. *To próg matematyczny, nie kurs dostępny u bukmachera ani dowód przewagi.</p>'+
   '<details class="coupon-check"><summary>Ocena ekspertów: ZA / PRZECIW / HIPOTEZA <span>+</span></summary>'+
   '<p><strong>ZA:</strong> '+escape(c.forText)+'</p><p class="danger"><strong>PRZECIW:</strong> '+escape(c.againstText)+'</p>'+
   '<p><strong>„CZUTKA” DO WERYFIKACJI:</strong> '+escape(c.hypothesis)+'</p>'+
   '<p><strong>UWAGA:</strong> Dane historyczne i kursy nie przeszły pełnej kalibracji. Sprawdź oficjalny terminarz.</p></details>'+
   '<div class="coupon-real"><label for="coupon-odds-'+i+'">Wpisz rzeczywisty łączny kurs całego zestawienia</label>'+
   '<input class="field" id="coupon-odds-'+i+'" inputmode="decimal" autocomplete="off" data-coupon-quote="'+i+'" placeholder="np. 3,20"/>'+
   '<p class="coupon-course-result" id="coupon-result-'+i+'">Porównanie ma charakter edukacyjny; model nie potwierdza wartości oczekiwanej.</p></div>'+
   '</article>';
 }
 function quote(i,str){
  const c=state.coupons[i],result=$('coupon-result-'+i);
  if(!c||!result)return;
  const raw=String(str).trim().replace(',','.');
  if(!raw){result.textContent='Wprowadź kurs całej kombinacji, nie iloczyn kursów składowych z różnych ofert.';return;}
  const odds=Number(raw);
  if(!Number.isFinite(odds)||odds<=1||odds>100000){result.textContent='Wpisz prawidłowy dodatni kurs większy niż 1.';return;}
  const threshold=1/(.88*odds);
  result.textContent='Dla kursu '+C.fmt(odds)+' matematyczny próg skuteczności wynosi '+C.fmtP(threshold)+
   '. Model szacuje '+C.fmtP(c.p)+', lecz nie jest skalibrowany; porównanie NIE potwierdza przewagi ani opłacalności.';
 }
 async function loadDailyAudit(){
  const title=$('coupon-daily-title'),note=$('coupon-daily-note');
  try{
   const record=await fjson('./data/track_record.json');
   if(record.status!=='ready'||!Number.isFinite(Date.parse(record.updated_utc)))throw Error('Report unavailable');
   const age=(Date.now()-Date.parse(record.updated_utc))/3600000;
   if(age>48||age< -1)throw Error('Report stale');
   const settled=(record.entries?.main||[]).filter(x=>(x.state==='hit'||x.state==='miss')&&x.date);
   if(!settled.length){title.textContent='Brak rozliczonych prognoz';note.textContent='Nie pokazujemy szacunkowych trafień.';return;}
   const date=settled.map(x=>x.date).sort().at(-1);
   const day=settled.filter(x=>x.date===date),hits=day.filter(x=>x.state==='hit').length;
   title.textContent=date+' · '+hits+' trafionych / '+(day.length-hits)+' nietrafionych';
   note.textContent='Wyniki '+day.length+' prognoz zapisanych przed meczami. To nie są faktycznie zawarte kupony. Wysoki procent nie gwarantuje wyniku.';
  }catch(_){
   title.textContent='Nie można potwierdzić aktualnego bilansu';
   note.textContent='Dane rozliczeń nieaktualne lub niedostępne. Nie zgadujemy trafień.';
  }
 }
 function render(){
  if(!state.loaded||state.stale)return;
  const profile=state.profile;
  const eligible=matchFilter();
  const count=Number($('coupon-count').value)||2;
  state.coupons=C.createCoupons(eligible,profile,count,6).map(c=>({...c,legs:[...c.legs].sort((a,b)=>chronological(a.match,b.match))})).sort((a,b)=>chronological(a.legs[0].match,b.legs[0].match)||b.score-a.score);
  $('coupon-list-title').textContent='Warianty: '+profileLabels[profile];
  $('coupon-number').textContent=state.coupons.length+' hipotez';
  $('coupon-help').textContent=descriptions[profile];
  $('coupon-explain').textContent='Dostępne spotkania z wymaganą próbką: '+eligible.length+'. '+descriptions[profile];
  $('coupon-cards').innerHTML=state.coupons.length?state.coupons.map(renderCard).join(''):
   '<div class="coupon-nothing">Brak scenariuszy spełniających filtry i warunki jakości. Zmień termin lub profil. Nie generujemy kuponów na siłę.</div>';
 }
 function selectProfile(profile){
  if(!descriptions[profile])return;
  state.profile=profile;
  document.querySelectorAll('[data-profile]').forEach(btn=>{
   const active=btn.dataset.profile===profile;
   btn.classList.toggle('is-selected',active);btn.setAttribute('aria-pressed',String(active));
  });
  if(profile==='single')$('coupon-count').value='1';
  else if($('coupon-count').value==='1')$('coupon-count').value='2';
  $('coupon-count').disabled=profile==='builder'||profile==='single';
  $('coupon-help').textContent=descriptions[profile];
  render();
 }
 document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-profile]').forEach(btn=>btn.addEventListener('click',()=>selectProfile(btn.dataset.profile)));
  ['coupon-count','coupon-days','coupon-league','coupon-include-today'].forEach(id=>$(id).addEventListener('change',render));
  $('coupon-build').addEventListener('click',render);
  $('coupon-reload').addEventListener('click',()=>{load();loadDailyAudit();});
  $('coupon-evening').addEventListener('click',e=>{const button=e.target.closest('[data-evening-copy]');if(button)copyTodayResearch(button.dataset.eveningCopy,button);});
  $('coupon-cards').addEventListener('input',e=>{
   if(e.target?.matches('[data-coupon-quote]'))quote(Number(e.target.dataset.couponQuote),e.target.value);
  });
  load();loadDailyAudit();
 });
})();