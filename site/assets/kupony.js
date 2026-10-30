'use strict';
/* EDGE LAB 0.6 — offline-capable static UI: no login, no live odds, no bookmaker links. */
(function(){
 const C=window.EDGECOUPONS;
 if(!C)throw Error('Coupon core missing');
 const $=id=>document.getElementById(id);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Warsaw'}).format(new Date());
 const state={matches:[],leagues:[],coupons:[],loaded:false,profile:'selective',stale:true};
 const kickoff=m=>{const t=String(m.time||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);const n=t&&+t[1]<24&&+t[2]<60?+t[1]*60+(+t[2]):1440;return m.date+' '+String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
 const chronological=(a,b)=>kickoff(a).localeCompare(kickoff(b));
 const descriptions={
   selective:'Wyższe szacunki modelu, ale to nie są „pewniaki” ani sprawdzone przewagi rynkowe.',
   balanced:'Kilka rynków, różne spotkania, próba uniknięcia powtórzeń. Brak dowodu rentowności.',
   contrarian:'Model odstaje od historycznej częstości ligi. „Czutka” jest hipotezą, nie algorytmem przewagi nad kursami.',
   builder:'Wspólne zdarzenia jednego meczu policzone z tej samej siatki wyników.'
 };
 const profileLabels={selective:'Selektywny',balanced:'Balans',contrarian:'Kontrariański',builder:'Bet Builder'};
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
  state.loaded=false;state.stale=true;
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
      time:f.time||'',model:C.analyze(f,history)});
    }
    return {league,matches};
   }));
   const valid=attempts.filter(x=>x.status==='fulfilled').map(x=>x.value);
   if(!valid.length)throw Error('Brak kompletnych źródeł danych — nie układamy fikcyjnych zestawień.');
   state.matches=valid.flatMap(x=>x.matches);
   state.leagues=valid.map(x=>x.league);
   state.stale=false;state.loaded=true;
   $('coupon-state').textContent='Dane wczytane · nie LIVE';
   $('coupon-updated').textContent='Pobrano '+new Date(status.retrieved_at_utc).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'})+' · brak gwarancji terminarza';
   $('coupon-leagues').textContent=String(valid.length);
   const next=state.matches.filter(m=>C.daysBetween(m.date,today())>=1&&C.daysBetween(m.date,today())<=14);
   $('coupon-fixtures').textContent=String(next.length);
   $('coupon-ready').textContent=String(next.filter(m=>m.model).length);
   const missed=attempts.length-valid.length;
   if(missed)setFailure(missed+' źródeł nie przeszło kontroli. Nie uwzględniono ich w wynikach.');
   const select=$('coupon-league'),prior=select.value;
   select.innerHTML='<option value="all">Wszystkie dostępne</option>'+state.leagues.map(l=>
     '<option value="'+escape(l.id)+'">'+escape(l.name)+'</option>').join('');
   if([...select.options].some(x=>x.value===prior))select.value=prior;
   render();
  }catch(e){
   $('coupon-state').textContent='Źródła niedostępne';
   setFailure(String(e?.message||e));
   $('coupon-leagues').textContent='0';
   $('coupon-fixtures').textContent='0';
   $('coupon-ready').textContent='0';
   $('coupon-cards').innerHTML='<div class="coupon-nothing">Nie mamy aktualnych danych. Nie generujemy sztucznych zestawień. Sprawdź synchronizację GitHub Actions.</div>';
   $('coupon-number').textContent='0';
  }finally{$('coupon-reload').disabled=false;}
 }
 function matchFilter(){
  const days=Number($('coupon-days').value)||14;
  const league=$('coupon-league').value;
  return state.matches.filter(m=>m.model&&C.daysBetween(m.date,today())>=1&&C.daysBetween(m.date,today())<=days
    &&(league==='all'||m.leagueId===league)).sort(chronological);
 }
 function profileName(type,count){return type==='builder'?'Scenariusz jednego meczu':count+' mecze / '+profileLabels[type];}
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
  const math=multi?'Iloczyn szacunków dla różnych spotkań (przybliżenie niezależności).':
   'Wspólne prawdopodobieństwo dwóch zdarzeń wyliczone łącznie, z korelacją.';
  return '<article class="coupon-card">'+
   '<div class="coupon-cardhead"><div><div class="eyebrow">WARIANT '+String(i+1).padStart(2,'0')+' · '+escape(profileLabels[c.profile])+'</div>'+
   '<h3>'+escape(profileName(c.profile,c.legs.length))+'</h3></div><span class="coupon-pill">HIPOTEZA</span></div>'+
   '<div class="coupon-leglist">'+legs+'</div>'+
   '<div class="coupon-metrics"><div class="coupon-metric"><small>Prawdopodobieństwo modelowe</small><strong class="light">'+C.fmtP(c.p)+'</strong></div>'+
   '<div class="coupon-metric"><small>Próg kursu przy podatku 12%*</small><strong>'+C.fmt(c.requiredOdds)+'</strong></div></div>'+
   '<p class="coupon-truth">'+escape(math)+' *To próg matematyczny, nie kurs dostępny u bukmachera ani dowód przewagi.</p>'+
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
  $('coupon-count').disabled=profile==='builder';
  $('coupon-help').textContent=descriptions[profile];
  render();
 }
 document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-profile]').forEach(btn=>btn.addEventListener('click',()=>selectProfile(btn.dataset.profile)));
  ['coupon-count','coupon-days','coupon-league'].forEach(id=>$(id).addEventListener('change',render));
  $('coupon-build').addEventListener('click',render);
  $('coupon-reload').addEventListener('click',load);
  $('coupon-cards').addEventListener('input',e=>{
   if(e.target?.matches('[data-coupon-quote]'))quote(Number(e.target.dataset.couponQuote),e.target.value);
  });
  load();
 });
})();