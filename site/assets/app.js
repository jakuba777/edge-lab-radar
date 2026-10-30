'use strict';
const S={meta:null,leagues:[],results:[],fixtures:[],modeled:[],candidates:[],loaded:false,selectedBuilder:null};
const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateOf=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const today=dateOf(new Date());
const epoch=d=>Date.parse(d+'T00:00:00Z');
const dateGap=(a,b)=>(epoch(a)-epoch(b))/86400000;
const isDate=s=>typeof s==='string'&&/^20\d{2}-\d\d-\d\d$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const val=s=>s===null||s===undefined||s===''?null:Number.isFinite(Number(s))?Number(s):null;
const pct=n=>`${(100*n).toFixed(1).replace('.',',')}%`;
const num=n=>Number(n).toFixed(2).replace('.',',');
const marketDefs=[
 {id:'o15',label:'Powyżej 1,5 gola',hit:(h,a)=>h+a>=2},
 {id:'o25',label:'Powyżej 2,5 gola',hit:(h,a)=>h+a>=3},
 {id:'u35',label:'Poniżej 3,5 gola',hit:(h,a)=>h+a<=3},
 {id:'btts',label:'Obie strzelą',hit:(h,a)=>h>0&&a>0},
 {id:'hg',label:'Gospodarze strzelą',hit:(h,a)=>h>0},
 {id:'ag',label:'Goście strzelą',hit:(h,a)=>a>0},
 {id:'h2',label:'Gospodarze min. 2 gole',hit:(h,a)=>h>=2},
 {id:'x',label:'Remis',hit:(h,a)=>h===a}];
function parseCSV(text){
 const out=[];let row=[],buf='',inQuotes=false;
 text=String(text??'').replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(inQuotes&&text[i+1]==='"'){buf+='"';i++;}else inQuotes=!inQuotes;}
  else if(c===','&&!inQuotes){row.push(buf);buf='';}
  else if((c==='\r'||c==='\n')&&!inQuotes){if(c==='\r'&&text[i+1]==='\n')i++;row.push(buf);buf='';if(row.some(v=>v!==''))out.push(row);row=[];}
  else buf+=c;
 }
 row.push(buf);if(row.some(v=>v!==''))out.push(row);
 if(!out.length)return [];
 const keys=out.shift().map(x=>x.trim());return out.map(cols=>Object.fromEntries(keys.map((k,i)=>[k,cols[i]??''])));
}
function validateCSV(text,kind){
 const rows=parseCSV(text),needed=kind==='results'?['date','home','away','ft_home','ft_away']:['date','home','away'];
 if(!rows.length||!needed.every(k=>Object.hasOwn(rows[0],k)))throw Error(`Niezgodne kolumny CSV: ${kind}`);
 return rows;
}
function poiss(k,lambda){let p=Math.exp(-lambda);for(let i=1;i<=k;i++)p*=lambda/i;return p;}
function makeGrid(h,a){const grid=[];let total=0;for(let x=0;x<=12;x++)for(let y=0;y<=12;y++){const p=poiss(x,h)*poiss(y,a);grid.push({h:x,a:y,p});total+=p;}return grid.map(g=>({...g,p:g.p/total}));}
function probability(grid,fn){return grid.reduce((sum,g)=>sum+(fn(g.h,g.a)?g.p:0),0);}
function sum(xs,fn){return xs.reduce((s,x)=>s+fn(x),0);}
function avg(xs,fn){return xs.length?sum(xs,fn)/xs.length:0;}
function model(f,hist){
 const prior=hist.filter(r=>r.date<f.date);
 const hm=prior.filter(r=>r.home===f.home).slice(-10);
 const aw=prior.filter(r=>r.away===f.away).slice(-10);
 if(hm.length<4||aw.length<4)return{ok:false,nH:hm.length,nA:aw.length,reason:'Za mało zakończonych meczów dom/wyjazd (minimum 4 na stronę).'};
 const lh0=Math.max(.2,avg(prior,r=>r.hs)),la0=Math.max(.2,avg(prior,r=>r.as));
 const smooth=(mean,n,baseline)=>(mean*n+baseline*5)/(n+5);
 const ha=smooth(avg(hm,r=>r.hs),hm.length,lh0);
 const hd=smooth(avg(hm,r=>r.as),hm.length,la0);
 const aa=smooth(avg(aw,r=>r.as),aw.length,la0);
 const ad=smooth(avg(aw,r=>r.hs),aw.length,lh0);
 const lambdaH=Math.max(.25,Math.min(3.7,Math.sqrt(ha*ad)));
 const lambdaA=Math.max(.25,Math.min(3.7,Math.sqrt(aa*hd)));
 const grid=makeGrid(lambdaH,lambdaA);
 const probs=Object.fromEntries(marketDefs.map(x=>[x.id,probability(grid,x.hit)]));
 const score=Math.min(hm.length,aw.length)+Math.min(6,prior.length/50);
 return{ok:true,nH:hm.length,nA:aw.length,lambdaH,lambdaA,grid,probs,score};
}
async function fetchText(path){const r=await fetch(path,{cache:'no-cache',credentials:'omit',mode:'same-origin'});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.text();}
async function fetchJSON(path){const r=await fetch(path,{cache:'no-cache',credentials:'omit',mode:'same-origin'});if(!r.ok)throw Error(`status.json: HTTP ${r.status}`);return r.json();}
async function sync(){
 const button=$('refresh');button.disabled=true;$('status-title').textContent='Wczytywanie rzeczywistych danych…';$('source-error').classList.add('hidden');
 try{
  const meta=await fetchJSON('./data/status.json');
  if(!Array.isArray(meta.leagues)||!meta.leagues.length||!meta.retrieved_at_utc)throw Error('Plik statusu nie zawiera listy lig ani czasu pobrania.');
  const fetches=await Promise.allSettled(meta.leagues.map(async l=>{
   if(!/^[A-Za-z0-9_-]+$/.test(l.id))throw Error('Nieprawidłowy identyfikator ligi');
   const p='./data/'+l.id+'/';
   const [rh,fh]=await Promise.all([fetchText(p+'results_2627.csv'),fetchText(p+'fixtures_2627.csv')]);
   const r=validateCSV(rh,'results').filter(x=>isDate(x.date)&&x.home&&x.away&&val(x.ft_home)!==null&&val(x.ft_away)!==null)
    .map(x=>({date:x.date,home:x.home,away:x.away,hs:val(x.ft_home),as:val(x.ft_away),league:l.name}));
   const f=validateCSV(fh,'fixtures').filter(x=>isDate(x.date)&&x.home&&x.away)
    .map(x=>({date:x.date,home:x.home,away:x.away,time:x.time||'',league:l.name,leagueId:l.id}));
   return{l,results:r,fixtures:f};
  }));
  const ok=fetches.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!ok.length)throw Error('Nie udało się pobrać żadnej ligi. Otwórz stronę po publikacji przez HTTPS; plik lokalny bez katalogu data nie zadziała.');
  S.meta=meta;S.leagues=ok.map(x=>x.l);S.results=ok.flatMap(x=>x.results);S.fixtures=ok.flatMap(x=>x.fixtures);
  // Each league is modeled against its own league's history, never pooled between leagues.
  S.modeled=S.fixtures.map((f,i)=>({id:`${f.leagueId}:${f.date}:${f.home}:${f.away}`,f,m:model(f,S.results.filter(r=>r.league===f.league))}));
  S.loaded=true;
  const ageHours=(Date.now()-new Date(meta.retrieved_at_utc).getTime())/3600000;
  const stale=ageHours>48;
  const errors=fetches.filter(x=>x.status==='rejected').length;
  $('status-title').textContent=stale?'Dane nieaktualne — sprawdź synchronizację':'Dane sportowe załadowane';
  $('last-update').textContent=`Pobrano ${new Date(meta.retrieved_at_utc).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'})} · ${ok.length} lig · ${errors?errors+' błędów źródeł · ':''}${stale?'ponad 48 h temu':'dane nie są LIVE'}`;
  $('metric-leagues').textContent=ok.length;
  $('metric-matches').textContent=S.fixtures.filter(x=>dateGap(x.date,today)>=0&&dateGap(x.date,today)<=14).length;
  $('metric-models').textContent=S.modeled.filter(x=>x.m.ok&&dateGap(x.f.date,today)>=0&&dateGap(x.f.date,today)<=14).length;
  if(errors||stale){$('source-error').classList.remove('hidden');$('source-error').textContent=errors?`${errors} źródeł nie zadziałało. Wyniki mogą być niepełne.`:'Aktualizacja źródła jest opóźniona; nie używaj do decyzji na dziś.';}
  renderAll(stale);
 }catch(e){
  S.loaded=false;$('status-title').textContent='Brak danych — aktualizacja nieudana';$('source-error').classList.remove('hidden');$('source-error').textContent=String(e?.message||e);
  $('metric-leagues').textContent='0';$('metric-matches').textContent='0';$('metric-models').textContent='0';
  $('candidates').innerHTML='<div class="panel empty">Brak wiarygodnych analiz. Najpierw potrzebne są dane źródłowe.</div>';
  $('more-matches').innerHTML='<div class="panel empty">Nie pobrano terminarza.</div>';
  $('all-matches').innerHTML='<div class="panel empty">Nie pobrano terminarza.</div>';
 }finally{button.disabled=false;}
}
function kickoffKey(f){const m=String(f.time||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);const n=m&&+m[1]<24&&+m[2]<60?+m[1]*60+(+m[2]):1440;return f.date+' '+String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function byKickoff(a,b){return kickoffKey(a.f).localeCompare(kickoffKey(b.f))||(b.score||0)-(a.score||0);}
function topCandidates(){
 const from=S.modeled.filter(x=>x.m.ok&&dateGap(x.f.date,today)>=0&&dateGap(x.f.date,today)<=14);
 return from.map(x=>{
  const interested=['o15','o25','u35','btts'];
  const best=interested.map(id=>({id,p:x.m.probs[id]})).sort((a,b)=>Math.abs(b.p-.5)-Math.abs(a.p-.5))[0];
  return{...x,market:best,score:x.m.score};
 }).sort(byKickoff).slice(0,16);
}
function card(x,detailed=false){
 const f=x.f,m=x.m,caption=m.ok?`Próba ${m.nH} dom / ${m.nA} wyjazd · model eksperymentalny`:`Próba ${m.nH}/4 dom · ${m.nA}/4 wyjazd`;
 const mt=x.market?marketDefs.find(z=>z.id===x.market.id):null;
 return `<button type="button" class="match-card" data-match="${safe(x.id)}"><div class="cardhead"><div><div class="cardleague">${safe(f.league)} · ${safe(f.date)}${f.time?' · '+safe(f.time):''}</div><div class="team">${safe(f.home)}<br>${safe(f.away)}</div></div><span class="chip ${m.ok?'good':'warn'}">${m.ok?'Model':'Brak modelu'}</span></div>${m.ok&&mt?`<div class="lead"><div><strong>${safe(mt.label)}</strong><small>Hipoteza statystyczna, bez weryfikacji kursu</small></div><span class="prob">${pct(x.market.p)}</span></div>`:''}<div class="card-foot">${safe(caption)}</div></button>`;
}
function renderAll(stale=false){
 const all=S.modeled.filter(x=>dateGap(x.f.date,today)>=0&&dateGap(x.f.date,today)<=14).sort(byKickoff);
 S.candidates=stale?[]:topCandidates();
 $('candidates').innerHTML=S.candidates.length?S.candidates.map(x=>card(x)).join(''):'<div class="panel empty">Dziś brak modeli z wystarczającą historią lub źródła są nieaktualne. Nie wymuszamy typów.</div>';
 $('count-picks').textContent=`${S.candidates.length} analiz`;
 const picked=new Set(S.candidates.map(x=>x.id));
 const more=all.filter(x=>!picked.has(x.id)).slice(0,30);
 $('more-matches').innerHTML=more.length?more.map(x=>card(x)).join(''):'<div class="panel empty">Brak kolejnych meczów w tym okresie.</div>';
 const sel=$('league'),prev=sel.value;sel.innerHTML='<option value="all">Wszystkie dostępne</option>'+S.leagues.map(l=>`<option value="${safe(l.name)}">${safe(l.name)}</option>`).join('');if([...sel.options].some(x=>x.value===prev))sel.value=prev;
 const builder=$('builder-match'),old=builder.value;
 const avail=S.modeled.filter(x=>x.m.ok&&dateGap(x.f.date,today)>=0&&dateGap(x.f.date,today)<=14).sort(byKickoff);
 builder.innerHTML='<option value="">Wybierz mecz</option>'+avail.map(x=>`<option value="${safe(x.id)}">${safe(x.f.date)} · ${safe(x.f.home)} – ${safe(x.f.away)}</option>`).join('');if(avail.some(x=>x.id===old))builder.value=old;
 renderMatches();
}
function renderMatches(){
 if(!S.loaded)return;
 const d=$('from-date').value||today,range=Number($('range').value)||14,search=$('search').value.toLocaleLowerCase('pl'),l=$('league').value;
 const items=S.modeled.filter(x=>dateGap(x.f.date,d)>=0&&dateGap(x.f.date,d)<=range&&(l==='all'||x.f.league===l)&&(`${x.f.home} ${x.f.away} ${x.f.league}`).toLocaleLowerCase('pl').includes(search)).sort(byKickoff);
 $('matches-count').textContent=`Znaleziono ${items.length} spotkań; godziny z danych źródłowych mogą być przesunięte.`;
 $('all-matches').innerHTML=items.length?items.slice(0,70).map(x=>card(x)).join(''):'<div class="panel empty">Brak meczów spełniających filtry.</div>';
}
function openDetail(id){
 const x=S.modeled.find(z=>z.id===id);if(!x)return;
 const f=x.f,m=x.m;
 const history=S.results.filter(r=>r.league===f.league&&r.date<f.date&&(r.home===f.home||r.away===f.away)).slice(-16);
 let out=`<p class="kicker">${safe(f.league)} · ${safe(f.date)}</p><h2>${safe(f.home)} – ${safe(f.away)}</h2><p class="caption">Źródło: open-matchday · sezon 2026/27</p>`;
 if(m.ok){out+=`<div class="detail-stats"><div>Gole gospodarzy (λ)<strong>${num(m.lambdaH)}</strong></div><div>Gole gości (λ)<strong>${num(m.lambdaA)}</strong></div></div>`;
 out+=marketDefs.slice(0,6).map(z=>`<div class="data-row"><span>${safe(z.label)}</span><span>${pct(m.probs[z.id])}</span></div>`).join('');
 out+=`<p class="caption">Model Poissona, N=${m.nH}/${m.nA}, brak kalibracji. Wahania kursów, składów i motywacji nie są uwzględniane.</p>`;
 }else out+=`<p class="alert compact">${safe(m.reason)} Nie pokazujemy fikcyjnych prawdopodobieństw.</p>`;
 out+=`<div class="separator" style="margin-top:15px"></div><p class="kicker" style="margin-top:12px">HISTORYCZNE WYNIKI (OSTATNIE DOSTĘPNE)</p>`;
 out+=history.length?history.slice(-8).reverse().map(r=>`<div class="data-row"><span>${safe(r.date)} · ${safe(r.home)} – ${safe(r.away)}</span><span>${r.hs}:${r.as}</span></div>`).join(''):'<p class="caption">Brak wcześniejszych meczów w źródle.</p>';
 $('detail-body').innerHTML=out;
 const dia=$('detail-dialog');if(typeof dia.showModal==='function')dia.showModal();else dia.setAttribute('open','');
}
function checkedMarkets(){return [...document.querySelectorAll('#builder-markets input:checked')].map(t=>marketDefs.find(m=>m.id===t.value)).filter(Boolean)}
function analyzeBuilder(){
 const match=S.modeled.find(x=>x.id===$('builder-match').value&&x.m.ok),legs=checkedMarkets();
 S.selectedBuilder=null;
 if(!match){$('builder-result').textContent='Wybierz spotkanie z dostateczną historią.';return;}
 if(legs.length<2||legs.length>3){$('builder-result').textContent='Wybierz 2 lub 3 zdarzenia.';return;}
 const p=probability(match.m.grid,(h,a)=>legs.every(l=>l.hit(h,a)));
 const naive=legs.reduce((r,l)=>r*match.m.probs[l.id],1);
 S.selectedBuilder={match,p,legs};
 $('builder-result').innerHTML=`<div class="success"><strong>Hipoteza wspólnego wystąpienia: ${pct(p)}</strong><p>Przy błędnym założeniu niezależności: ${pct(naive)}.</p><p class="caption">Wynik modelu nieskalibrowanego, nie jest to zweryfikowana szansa rynkowa.</p></div>`;
 showQuote();
}
function showQuote(){
 const n=Number($('odds').value.replace(',','.'));
 if(!(n>1)||!Number.isFinite(n)){$('quote-result').textContent='Wpisz poprawny rzeczywisty kurs całego Bet Buildera.';return;}
 const threshold=1/(.88*n);
 $('quote-result').innerHTML=`<div class="data-row"><span>Próg rentowności po standardowym podatku 12%</span><span>${pct(threshold)}</span></div><p class="caption">To tylko matematyczny próg. Bez niezależnej kalibracji modelu nie wiemy, czy kurs ma dodatnią wartość oczekiwaną.</p>`;
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 $('subdate').textContent=new Intl.DateTimeFormat('pl-PL',{timeZone:'Europe/Warsaw',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
 $('from-date').value=today;
 document.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-screen]').forEach(q=>q.classList.toggle('is-active',q===b));
  document.querySelectorAll('.screen').forEach(q=>q.classList.toggle('is-active',q.id==='screen-'+b.dataset.screen));
  window.scrollTo({top:0,behavior:'instant'});
 }));
 $('refresh').addEventListener('click',sync);
 ['search','from-date','range','league'].forEach(id=>$(id).addEventListener('input',renderMatches));
 document.body.addEventListener('click',ev=>{const btn=ev.target.closest('[data-match]');if(btn)openDetail(btn.dataset.match);});
 $('close-detail').addEventListener('click',()=>$('detail-dialog').close());
 $('detail-dialog').addEventListener('click',ev=>{if(ev.target===$('detail-dialog'))$('detail-dialog').close();});
 $('builder-markets').innerHTML=marketDefs.map(x=>`<label class="market-option"><input type="checkbox" value="${safe(x.id)}"/><span>${safe(x.label)}</span></label>`).join('');
 $('builder-markets').addEventListener('change',()=>{$('builder-result').textContent='Naciśnij „Analizuj kombinację”.';S.selectedBuilder=null;});
 $('builder-match').addEventListener('change',()=>{$('builder-result').textContent='Wybierz 2–3 zdarzenia, potem przeanalizuj.';S.selectedBuilder=null;});
 $('analyze-builder').addEventListener('click',analyzeBuilder);
 $('odds').addEventListener('input',showQuote);
 sync();
});
// Expose *only* pure functions in test runner (Node); not on window in a browser.
if(typeof module!=='undefined'&&module.exports){module.exports={parseCSV,isDate,poiss,makeGrid,probability,model,marketDefs,safe,dateGap};}