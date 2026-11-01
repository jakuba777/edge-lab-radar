'use strict';
(function(){
 const C=window.EDGECOUPONS,W=window.EDGEWINDOW,$=id=>document.getElementById(id);
 const state={matches:[],selected:null,legs:[],stamp:null};
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const pct=p=>Number.isFinite(p)?(p*100).toFixed(1).replace('.',',')+'%':'—';
 const text=(tag,content,cls)=>{const el=document.createElement(tag);el.textContent=content;if(cls)el.className=cls;return el;};
 const fmt=m=>m.date+' · '+(m.time||'godzina nieznana')+' · '+m.league;
 async function fetchFile(path,kind){const r=await fetch(path,{cache:'no-store',credentials:'omit',mode:'same-origin'});if(!r.ok)throw Error(path+' HTTP '+r.status);return kind==='json'?r.json():r.text();}
 function choose(m){
  state.selected=m;state.legs=[];$('detail').classList.remove('hide');$('fixture').textContent=m.home+' — '+m.away;
  $('context').textContent=fmt(m);
  const a=$('analysis');a.replaceChildren();
  if(!m.model){a.append(text('p','Brak wystarczających danych historycznych do wiarygodnego wyliczenia. Nie tworzymy typów.','warning'));$('markets').replaceChildren();$('builder').replaceChildren();return;}
  const x=m.model;
  a.append(text('h3','Analiza przedmeczowa'));
  a.append(text('p','Próba: '+x.nH+' ostatnich domowych gospodarzy, '+x.nA+' wyjazdowych gości; '+x.nLeague+' wcześniejszych meczów ligowych.'));
  a.append(text('p','Oczekiwane gole (model Poissona): '+x.lh.toFixed(2)+' — '+x.la.toFixed(2)));
  a.append(text('p','ZA: model bazuje wyłącznie na wynikach sprzed daty meczu. PRZECIW: nie uwzględnia potwierdzonych składów, kontuzji ani kursów; prawdopodobieństwa nie są skalibrowane.','muted'));
  a.append(text('p','Ocena ryzyka: NIEZWERYFIKOWANE — nie ma podstaw do deklarowania przewagi nad bukmacherem.','warning'));
  renderMarkets();renderBuilder();
 }
 function renderMarkets(){
  const node=$('markets');node.replaceChildren();node.append(text('p','Nazwy rynków ułatwiają wyszukiwanie w Superbet, ale mogą różnić się od aktualnej oferty. Nie pobieramy kursów.','muted'));
  for(const def of C.MARKETS){const row=text('div','', 'market');const left=document.createElement('div');left.append(text('strong',def.label));left.append(text('div','Prawdopodobieństwo modelu: '+pct(state.selected.model.ps[def.id]),'muted tiny'));const btn=text('button','Kopiuj');btn.type='button';btn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(def.label);btn.textContent='Skopiowano';}catch(_){btn.textContent='Zaznacz nazwę ręcznie';}});row.append(left,btn);node.append(row);}
 }
 function renderBuilder(){
  const node=$('builder');node.replaceChildren();const m=state.selected;
  if(!m.model)return;
  node.append(text('p','Zaznacz 2–3 rynki tego samego meczu. Wspólne prawdopodobieństwo liczymy z jednej siatki wyników, a nie przez mnożenie niezależnych zdarzeń.','muted'));
  const list=document.createElement('div');list.className='chips';
  for(const def of C.MARKETS){const btn=text('button',def.label);btn.type='button';btn.setAttribute('aria-pressed',String(state.legs.includes(def.id)));btn.addEventListener('click',()=>{if(state.legs.includes(def.id))state.legs=state.legs.filter(x=>x!==def.id);else if(state.legs.length<3)state.legs.push(def.id);renderBuilder();});list.append(btn);}
  node.append(list);
  if(state.legs.length>=2){const p=C.jointSameGame(m.model.dist,state.legs);node.append(text('h3','Wspólne prawdopodobieństwo modelu: '+pct(p)));node.append(text('p','To nie jest kurs bukmachera. Brak zweryfikowanej kalibracji, oferty Bet Builder i potwierdzonego EV.','warning'));const labels=state.legs.map(id=>C.MARKETS.find(x=>x.id===id).label).join(' + ');const copy=text('button','Kopiuj kombinację');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(labels);copy.textContent='Skopiowano';}catch(_){copy.textContent=labels;}});node.append(copy);}
  else node.append(text('p','Wybierz co najmniej 2 rynki.','muted'));
 }
 function showList(){
  const day=$('day').value,league=$('league').value,box=$('matches');box.replaceChildren();
  const found=state.matches.filter(m=>(day==='all'||m.date===day)&&(league==='all'||m.leagueId===league)).slice(0,100);
  if(!found.length)box.append(text('p','Brak nadchodzących spotkań w wybranym filtrze.','muted'));
  for(const m of found){const btn=text('button',m.home+' — '+m.away,'match');btn.type='button';btn.append(text('small',fmt(m)+(m.model?' · model dostępny':' · brak próby')));btn.addEventListener('click',()=>choose(m));box.append(btn);}
 }
 async function load(){
  try{
   if(!C||!W)throw Error('Nie załadowano modułów obliczeniowych.');
   const status=await fetchFile('./data/status.json','json');const age=(Date.now()-Date.parse(status.retrieved_at_utc))/3600000;
   if(!Number.isFinite(age)||age<0||age>48)throw Error('Dane starsze niż 48 godzin — analiza wstrzymana.');
   const results=await Promise.allSettled(status.leagues.map(async l=>{
    if(!/^[a-zA-Z0-9_-]+$/.test(l.id))throw Error('Niepoprawne ID ligi');
    const root='./data/'+l.id+'/';
    const [r,f]=await Promise.all([fetchFile(root+'results_2627.csv'),fetchFile(root+'fixtures_2627.csv')]);
    const hist=C.parseCSV(r).filter(x=>C.validDate(x.date)&&x.home&&x.away&&C.n(x.ft_home)!==null&&C.n(x.ft_away)!==null).map(x=>({date:x.date,home:x.home,away:x.away,hs:C.n(x.ft_home),as:C.n(x.ft_away)})).filter(x=>x.hs>=0&&x.as>=0&&x.hs<=14&&x.as<=14).sort((a,b)=>a.date.localeCompare(b.date));
    return C.parseCSV(f).filter(x=>C.validDate(x.date)&&x.home&&x.away&&x.home!==x.away).map(x=>({id:l.id+'|'+x.date+'|'+x.home+'|'+x.away,date:x.date,time:x.time||'',home:x.home,away:x.away,league:l.name,leagueId:l.id,model:C.analyze(x,hist)}));
   }));
   const now=today();const seen=new Set();
   state.matches=results.filter(x=>x.status==='fulfilled').flatMap(x=>x.value).filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return C.daysBetween(m.date,now)>=0&&C.daysBetween(m.date,now)<=14&&W.eligible(m,new Date(),age);}).sort((a,b)=>W.sortKey(a).localeCompare(W.sortKey(b)));
   $('status').textContent='Dostępne mecze: '+state.matches.length+' · dane nie LIVE';
   $('updated').textContent='Ostatnia aktualizacja: '+new Date(status.retrieved_at_utc).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'})+'. Źródła niedostępne: '+results.filter(x=>x.status==='rejected').length+'.';
   const days=[...new Set(state.matches.map(x=>x.date))];for(const day of days){const opt=text('option',day);opt.value=day;$('day').append(opt);}
   const leagues=[...new Map(state.matches.map(x=>[x.leagueId,x.league])).entries()];for(const [id,name] of leagues){const opt=text('option',name);opt.value=id;$('league').append(opt);}
   showList();
  }catch(e){$('status').textContent='Analiza niedostępna';$('updated').textContent=e.message;}
 }
 document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));for(const tab of ['analysis','markets','builder'])$(tab).classList.toggle('hide',tab!==id);}));
 $('day').addEventListener('change',showList);$('league').addEventListener('change',showList);load();
})();