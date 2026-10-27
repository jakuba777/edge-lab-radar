'use strict';
/* EDGE LAB Scenario Lab: experimental math, public same-origin data, no real bookmaker odds */
const SC={matches:[],leagues:[],scenarios:[],stale:true,loaded:false};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mk=[
 {id:'o15',name:'Powyżej 1,5 gola',fn:(h,a)=>h+a>=2},
 {id:'o25',name:'Powyżej 2,5 gola',fn:(h,a)=>h+a>=3},
 {id:'u35',name:'Poniżej 3,5 gola',fn:(h,a)=>h+a<=3},
 {id:'btts',name:'Obie drużyny strzelą',fn:(h,a)=>h>0&&a>0},
 {id:'hg',name:'Gol gospodarzy',fn:(h,a)=>h>0},
 {id:'ag',name:'Gol gości',fn:(h,a)=>a>0},
 {id:'h2',name:'Gospodarze strzelą 2+',fn:(h,a)=>h>=2}
];
const findMarket=id=>mk.find(m=>m.id===id);
const fmtP=p=>(100*p).toFixed(1).replace('.',',')+'%';
const fmtN=n=>Number(n).toFixed(2).replace('.',',');
const dayStamp=d=>new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Warsaw'}).format(d);
const dateToday=()=>dayStamp(new Date());
const diffDays=(a,b)=>(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000;
const dateOK=d=>typeof d==='string'&&/^20\d\d-\d\d-\d\d$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'));
const parseN=s=>s==null||s===''?null:Number.isFinite(Number(s))?Number(s):null;
function parseCSV(s){
 const lines=[];let part='',cols=[],quoted=false;
 s=String(s||'').replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){const c=s[i];
  if(c==='"'){if(quoted&&s[i+1]==='"'){part+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){cols.push(part);part='';}
  else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;cols.push(part);part='';if(cols.some(v=>v!==''))lines.push(cols);cols=[];}
  else part+=c;
 }
 cols.push(part);if(cols.some(v=>v!==''))lines.push(cols);
 if(lines.length<2)return [];
 const header=lines.shift();
 return lines.map(a=>Object.fromEntries(header.map((k,i)=>[k.trim(),a[i]||''])));
}
function poisson(k,rate){let v=Math.exp(-rate);for(let i=1;i<=k;i++)v*=rate/i;return v;}
function makeGrid(h,a){
 const raw=[];let sum=0;
 for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const p=poisson(i,h)*poisson(j,a);raw.push({h:i,a:j,p});sum+=p;}
 return raw.map(g=>({...g,p:g.p/sum}));
}
function probability(grid,fn){return grid.reduce((v,g)=>v+(fn(g.h,g.a)?g.p:0),0);}
function sameGameProbability(grid,marketIds){
 if(!grid||!marketIds?.length||marketIds.some(id=>!findMarket(id)))return NaN;
 const checks=marketIds.map(id=>findMarket(id).fn);
 return probability(grid,(h,a)=>checks.every(fn=>fn(h,a)));
}
function model(f,hist){
 const before=hist.filter(r=>r.date<f.date);
 const home=before.filter(r=>r.home===f.home).slice(-10);
 const away=before.filter(r=>r.away===f.away).slice(-10);
 if(home.length<6||away.length<6||before.length<55)return null; // research quality gate, stricter than radar
 const avg=(rs,fn)=>rs.reduce((s,r)=>s+fn(r),0)/rs.length;
 const hbase=Math.max(.2,avg(before,r=>r.hs)),abase=Math.max(.2,avg(before,r=>r.as));
 const smooth=(mean,n,base)=>(mean*n+base*5)/(n+5);
 const ha=smooth(avg(home,r=>r.hs),home.length,hbase);
 const hd=smooth(avg(home,r=>r.as),home.length,abase);
 const aa=smooth(avg(away,r=>r.as),away.length,abase);
 const ad=smooth(avg(away,r=>r.hs),away.length,hbase);
 const hl=Math.max(.25,Math.min(3.7,Math.sqrt(ha*ad)));
 const al=Math.max(.25,Math.min(3.7,Math.sqrt(aa*hd)));
 const grid=makeGrid(hl,al);
 return {grid,nH:home.length,nA:away.length,probs:Object.fromEntries(mk.map(m=>[m.id,probability(grid,m.fn)]))};
}
function crossGameProbability(legs){
 const ids=new Set(legs.map(l=>l.matchId));
 if(ids.size!==legs.length||!legs.every(l=>Number.isFinite(l.p)&&l.p>=0&&l.p<=1))return NaN;
 return legs.reduce((p,l)=>p*l.p,1);
}
function requiredQuote(p,tax=.12){return Number.isFinite(p)&&p>0&&p<=1&&tax>=0&&tax<1?1/((1-tax)*p):NaN;}
function loadText(p){return fetch(p,{credentials:'omit',cache:'no-cache',mode:'same-origin'}).then(r=>{if(!r.ok)throw Error(p+' HTTP '+r.status);return r.text();});}
function loadJson(p){return fetch(p,{credentials:'omit',cache:'no-cache',mode:'same-origin'}).then(r=>{if(!r.ok)throw Error(p+' HTTP '+r.status);return r.json();});}
async function load(){
 const button=$('scenario-refresh');button.disabled=true;$('scenario-error').classList.add('hidden');$('scenario-status').textContent='Wczytywanie terminarza…';
 try{
  const meta=await loadJson('./data/status.json');
  if(!meta?.leagues?.length||!meta.retrieved_at_utc)throw Error('Brak informacji o źródłach danych.');
  const age=(Date.now()-Date.parse(meta.retrieved_at_utc))/3600000;
  if(!Number.isFinite(age)||age<0||age>48)throw Error('Nieaktualny plik danych (ponad 48 godzin). Zestawienia zostały wyłączone.');
  const jobs=await Promise.allSettled(meta.leagues.map(async l=>{
   if(!/^[A-Za-z0-9_-]+$/.test(l.id))throw Error('Niepoprawny identyfikator źródła.');
   const base='./data/'+l.id+'/';
   const [ar,af]=await Promise.all([loadText(base+'results_2627.csv'),loadText(base+'fixtures_2627.csv')]);
   const rawR=parseCSV(ar),rawF=parseCSV(af);
   if(!rawR.length||!rawF.length||!['date','home','away','ft_home','ft_away'].every(k=>Object.hasOwn(rawR[0],k)))throw Error('Nieprawidłowy plik ligowy');
   const hist=rawR.filter(r=>dateOK(r.date)&&r.home&&r.away&&parseN(r.ft_home)!=null&&parseN(r.ft_away)!=null)
      .map(r=>({date:r.date,home:r.home,away:r.away,hs:parseN(r.ft_home),as:parseN(r.ft_away)})).sort((a,b)=>a.date.localeCompare(b.date));
   const fixtures=rawF.filter(f=>dateOK(f.date)&&f.home&&f.away)
      .map(f=>({date:f.date,home:f.home,away:f.away,time:f.time||'',league:l.name,leagueId:l.id}));
   return{league:l,matches:fixtures.map(f=>({f,m:model(f,hist),id:[l.id,f.date,f.home,f.away].join('|')}))};
  }));
  const fulfilled=jobs.filter(j=>j.status==='fulfilled').map(j=>j.value);
  if(!fulfilled.length)throw Error('Brak dostępnych lig; nie tworzymy fikcyjnych zestawień.');
  SC.matches=fulfilled.flatMap(x=>x.matches);
  SC.leagues=fulfilled.map(x=>x.league);
  SC.loaded=true;SC.stale=false;
  $('scenario-leagues').textContent=String(fulfilled.length);
  const future=SC.matches.filter(x=>diffDays(x.f.date,dateToday())>=1&&diffDays(x.f.date,dateToday())<=14);
  $('scenario-fixtures').textContent=String(future.length);
  $('scenario-valid').textContent=String(future.filter(x=>x.m).length);
  $('scenario-status').textContent='Źródła gotowe · dane nie są LIVE';
  $('scenario-source').textContent='Aktualizacja '+new Date(meta.retrieved_at_utc).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'})+' · '+fulfilled.length+' lig';
  const missing=jobs.length-fulfilled.length;
  if(missing){$('scenario-error').classList.remove('hidden');$('scenario-error').textContent=missing+' lig nie przeszło kontroli danych, pominięto je.';}
  const select=$('scenario-league');const old=select.value;
  select.innerHTML='<option value="all">Wszystkie dostępne</option>'+SC.leagues.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.name)+'</option>').join('');
  if([...select.options].some(o=>o.value===old))select.value=old;
  generate();
 }catch(e){
  SC.stale=true;SC.loaded=false;$('scenario-status').textContent='Scenariusze niedostępne';
  $('scenario-error').classList.remove('hidden');$('scenario-error').textContent=String(e?.message||e);
  $('scenario-results').innerHTML='<div class="sc-empty">Brak aktualnych, zweryfikowanych danych. Nie prezentujemy żadnych kombinacji.</div>';
 }finally{button.disabled=false;}
}
function futureMatches(){
 const days=Number($('scenario-days').value);
 const league=$('scenario-league').value;
 return SC.matches.filter(x=>x.m&&diffDays(x.f.date,dateToday())>=1&&diffDays(x.f.date,dateToday())<=days&&(league==='all'||league===x.f.leagueId));
}
function chooseMarket(x,target,seed){
 const choices=['hg','ag','o15','u35','o25','btts'];
 const pool=choices.map(id=>({id,p:x.m.probs[id]}))
   .filter(x=>x.p>=Math.max(.38,target-.24)&&x.p<=Math.min(.90,target+.20));
 if(!pool.length)return null;
 pool.sort((a,b)=>Math.abs(a.p-target)-Math.abs(b.p-target));
 // Alternate among closest market families, rather than repeatedly forcing 'over 1.5'.
 return pool[seed%Math.min(pool.length,3)];
}
function multipleScenarios(rows,count){
 const target=count===2?.73:count===3?.63:.56;
 const ranked=rows.map((x,i)=>{
  const market=chooseMarket(x,target,i%3);
  return market?{x,market,rank:Math.abs(market.p-target)+(.015*(10-Math.min(x.m.nH,x.m.nA)))}:null;
 }).filter(Boolean).sort((a,b)=>a.rank-b.rank||a.x.f.date.localeCompare(b.x.f.date));
 const results=[],seen=new Set();
 for(let offset=0;offset<Math.min(36,ranked.length);offset++){
  const legs=[],leagues=new Set(),markets=new Map();
  for(const c of [...ranked.slice(offset),...ranked.slice(0,offset)]){
   if(legs.some(q=>q.matchId===c.x.id)||leagues.has(c.x.f.leagueId))continue;
   if((markets.get(c.market.id)||0)>=2)continue;
   const market=c.market;
   legs.push({matchId:c.x.id,fixture:c.x.f,marketId:market.id,name:findMarket(market.id).name,p:market.p});
   leagues.add(c.x.f.leagueId);markets.set(market.id,(markets.get(market.id)||0)+1);
   if(legs.length===count)break;
  }
  if(legs.length!==count)continue;
  const key=legs.map(l=>l.matchId+'-'+l.marketId).sort().join('&');
  if(seen.has(key))continue;
  seen.add(key);
  const p=crossGameProbability(legs);
  if(!Number.isFinite(p)||p<=0)continue;
  results.push({legs,p,type:'multi',count});
  if(results.length===6)break;
 }
 return results;
}
const samePairs=[['o25','btts'],['hg','u35'],['ag','u35'],['h2','btts'],['o25','hg'],['o25','ag']];
const sameTriples=[['hg','ag','o25'],['h2','ag','u35'],['o25','hg','u35'],['btts','u35','o25']];
function sameGameScenarios(rows,count){
 const sets=count===2?samePairs:sameTriples;
 const all=[];const used=new Set();
 for(const x of rows){
  let pick=null;
  for(const ids of sets){
   const p=sameGameProbability(x.m.grid,ids);
   const sub=ids.map(id=>x.m.probs[id]);
   const nonRedundant=p<Math.min(...sub)-0.015; // reject tautological duplicate markets
   if(nonRedundant&&p>=.10&&p<=.75){
    const delta=Math.abs(p-(count===2?.36:.22));
    const quality=Math.min(x.m.nH,x.m.nA);
    const candidate={ids,p,score:delta-.004*quality};
    if(!pick||candidate.score<pick.score)pick=candidate;
   }
  }
  if(!pick||used.has(x.id))continue;
  used.add(x.id);
  all.push({type:'same',count,p:pick.p,quality:pick.score,legs:pick.ids.map(id=>({matchId:x.id,fixture:x.f,marketId:id,name:findMarket(id).name,p:x.m.probs[id]}))});
 }
 all.sort((a,b)=>a.quality-b.quality||a.legs[0].fixture.date.localeCompare(b.legs[0].fixture.date));
 return all.slice(0,6);
}
function scenariosFor(rows,profile){
 if(profile==='same2'||profile==='same3')return sameGameScenarios(rows,profile==='same2'?2:3);
 return multipleScenarios(rows,profile==='two'?2:profile==='three'?3:4);
}
function renderCard(s,i){
 const course=requiredQuote(s.p);
 let legs=s.legs.map(l=>'<div class="sc-leg"><div><b>'+esc(l.fixture.home)+' – '+esc(l.fixture.away)+'</b><small>'+esc(l.fixture.league)+' · '+esc(l.fixture.date)+(l.fixture.time?' · '+esc(l.fixture.time):'')+'</small><small>'+esc(l.name)+'</small></div><span class="p">'+fmtP(l.p)+'</span></div>').join('');
 const caveat=s.type==='same'?'Wspólne zdarzenia obliczone z tej samej siatki wyników, bez mnożenia pojedynczych szans.':'Różne spotkania; iloczyn szans przy założeniu niezależności (uproszczenie).';
 return '<article class="scenario-card"><div><div class="no">SYMULACJA '+(i+1)+'</div><h3>'+(s.type==='same'?'Jeden mecz · '+s.count+' warunki':s.count+' różne mecze')+'</h3></div><div class="sc-legs">'+legs+'</div><div class="sc-metrics"><div><small>Łączne P modelowe</small><strong>'+fmtP(s.p)+'</strong></div><div><small>Hipotetyczny próg kursu*</small><strong>'+fmtN(course)+'</strong></div></div><p class="sc-foot">'+esc(caveat)+'</p><div class="sc-quote"><label for="quote-'+i+'">Rzeczywisty kurs CAŁEGO zestawu (opcjonalnie)</label><input class="field" type="text" inputmode="decimal" id="quote-'+i+'" data-quote="'+i+'" placeholder="np. 4,50" autocomplete="off"/><p class="sc-feedback" id="feedback-'+i+'">*Wyliczony próg nie jest kursem bukmachera ani potwierdzeniem przewagi.</p></div><p class="sc-notice">Hipoteza eksperymentalna — brak potwierdzonego EV i niezależnej kalibracji. Sprawdź kurs i dane przed jakąkolwiek decyzją.</p></article>';
}
function generate(){
 if(!SC.loaded||SC.stale)return;
 const rows=futureMatches();
 const profile=$('scenario-type').value;
 SC.scenarios=scenariosFor(rows,profile);
 $('scenario-count').textContent=SC.scenarios.length+' symulacji';
 $('scenario-subtitle').textContent=profile.startsWith('same')?'Scenariusze z jednego spotkania: korelacje liczone łącznie.':'Zestawienia różnych spotkań: iloczyn prawdopodobieństw to jedynie uproszczenie.';
 $('scenario-results').innerHTML=SC.scenarios.length?SC.scenarios.map(renderCard).join(''):
  '<div class="sc-empty">Brak wystarczająco udokumentowanych spotkań dla wybranego wariantu. Zmień zakres dat albo liczbę meczów.</div>';
}
function quote(i,value){
 const sc=SC.scenarios[i],feed=$('feedback-'+i);if(!sc||!feed)return;
 const str=String(value).trim().replace(',','.');
 if(!str){feed.textContent='*Próg kursu jest tylko symulacją na podstawie nieskalibrowanego modelu.';return;}
 const odds=Number(str);
 if(!Number.isFinite(odds)||odds<=1){feed.textContent='Wpisz poprawny kurs większy niż 1.';return;}
 const needed=1/(.88*odds);
 feed.textContent='Przy podanym kursie matematyczny próg trafności wynosi '+fmtP(needed)+'. Nasza prognoza '+fmtP(sc.p)+' nie została skalibrowana — nie dowodzi przewagi.';
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',()=>{
 $('scenario-refresh').addEventListener('click',load);
 ['scenario-days','scenario-league','scenario-type'].forEach(id=>$(id).addEventListener('change',generate));
 $('scenario-generate').addEventListener('click',generate);
 $('scenario-results').addEventListener('input',e=>{const el=e.target;if(el.matches('[data-quote]'))quote(Number(el.dataset.quote),el.value);});
 load();
});
if(typeof module!=='undefined'&&module.exports)module.exports={parseCSV,model,makeGrid,probability,sameGameProbability,crossGameProbability,requiredQuote,chooseMarket,scenariosFor,mk};
