'use strict';
/* EDGE LAB — source-linked research cards; no betting API, live odds or inferred probabilities. */
(function(root){
 const defs={
  btts:'Obie drużyny strzelą gola — Tak',
  o25:'Suma goli — Powyżej 2,5',
  o15:'Suma goli — Powyżej 1,5',
  a2:'Gole gości — Powyżej 1,5',
  ag:'Gole gości — Powyżej 0,5',
  none:'Brak doboru — wymagana dalsza weryfikacja'
 };
 const $=id=>document.getElementById(id);
 const el=(tag,content,cls)=>{
  const x=document.createElement(tag);
  if(content!==undefined)x.textContent=String(content);
  if(cls)x.className=cls;
  return x;
 };
 const currentDate=()=>new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Warsaw'}).format(new Date());
 function scoreObserved(scores,id,side){
  if(!Array.isArray(scores)||scores.length!==3)return null;
  let wins=0;
  for(const x of scores){
   if(!Array.isArray(x)||x.length!==2||x.some(n=>!Number.isInteger(n)||n<0||n>15))return null;
   const scored=x[0],lost=x[1],sum=scored+lost;
   const applies=({o15:sum>=2,o25:sum>=3,btts:scored>0&&lost>0,
    a2:side==='home'?lost>=2:scored>=2,
    ag:side==='home'?lost>0:scored>0})[id];
   if(applies===undefined)return null;
   if(applies)wins++;
  }
  return {hits:wins,total:3};
 }
 function explainObserved(match){
  if(!match||!match.market||!match.homeRecent||!match.awayRecent)return null;
  const a=scoreObserved(match.homeRecent,match.market,'home');
  const b=scoreObserved(match.awayRecent,match.market,'away');
  if(!a||!b)return null;
  const part=match.market==='a2'||match.market==='ag'?'gospodarze tracili / goście strzelali':
   'w spotkaniach obu drużyn';
  return {home:a,away:b,description:part};
 }
 function dateStatus(date,now){
  if(now<date)return 'Nadchodzące mecze · sprawdź składy i terminarz przed pierwszym gwizdkiem.';
  if(now===date)return 'Dzisiaj · dane sprzed meczów, nie aktualizacja LIVE. Sprawdzaj oficjalne źródła.';
  return 'ARCHIWUM · karta badawcza z '+date+'. Nie traktuj jej jako bieżącej propozycji.';
 }
 function build(match,sources){
  const card=el('article',undefined,'verified-card');
  const head=el('div',undefined,'verified-card-head');
  const heading=el('div');
  heading.append(el('small',match.competition+' · '+match.time+' (Polska)','verified-meta'));
  heading.append(el('h3',match.home+' – '+match.away));
  const badge=el('span',match.tier+' · '+({A:'porównaj',B:'sprawdź',C:'odpuść'}[match.tier]||'kontrola'),'verified-tier tier-'+match.tier);
  head.append(heading,badge);card.append(head);
  card.append(el('p',defs[match.market]||'Brak zweryfikowanego rynku','verified-market'));
  if(match.alt)card.append(el('p','Alternatywa do osobnego porównania: '+match.alt,'verified-alt'));
  const observed=explainObserved(match);
  if(observed){
   const p=el('p',undefined,'verified-observed');
   p.append(el('strong','ZAOBSERWOWANE W UEFA, NIE PROGNOZA: '));
   p.append(el('span',match.home+' '+observed.home.hits+'/3 · '+match.away+' '+observed.away.hits+'/3 '+observed.description));
   card.append(p);
  }else if(match.observed){
   card.append(el('p',match.observed.label+': '+match.observed.hits+'/'+match.observed.sample+' (historyczna częstość, NIE prognoza)','verified-observed'));
  }else{
   card.append(el('p','Brak wystarczającej zweryfikowanej próby do wyceny.','verified-observed weak'));
  }
  const explain=el('details',undefined,'verified-reasons');
  explain.append(el('summary','Argumenty ZA / PRZECIW'));
  explain.append(el('p','ZA — '+match.why));
  explain.append(el('p','PRZECIW — '+match.risk,'verified-con'));
  card.append(explain);
  const sourceIds=[match.source,...(Array.isArray(match.extra_sources)?match.extra_sources:[])];
  for(const id of sourceIds){
   if(!sources[id])continue;
   const link=el('a','Źródło danych · '+sources[id].label);
   const url=String(sources[id].url);
   const allowed=/^https:\/\/(www\.uefa\.com|www\.efl\.com|statcaddie\.co\.uk|www\.sportsmole\.co\.uk|www\.wolves\.co\.uk|www\.portfoliosports\.com)\//;
   if(allowed.test(url)){link.href=url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);}
  }
  return card;
 }
 async function load(){
  const rootNode=$('v-list');
  if(!rootNode)return;
  try{
   const response=await fetch('./data/verified_2026-11-04.json',{cache:'no-store',credentials:'omit',mode:'same-origin'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   if(data.schema!==1||data.match_date!=='2026-11-04'||!Array.isArray(data.matches)||data.matches.length!==12)throw Error('Niekompletna lista kontrolna');
   if(new Set(data.matches.map(x=>x.id)).size!==12)throw Error('Zduplikowane spotkania');
   if(data.matches.some(x=>!['A','B','C'].includes(x.tier)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)||!data.sources[x.source]))throw Error('Nieprawidłowe dane badawcze');
   $('v-total').textContent=String(data.matches.length);
   $('verified-date-state').textContent=dateStatus(data.match_date,currentDate());
   $('v-asof').textContent='Snapshot z '+data.snapshot_date+' · dane wynikowe UEFA do 21.10.2026. Godziny w czasie polskim (CET). '+data.methodology;
   const sources=$('v-sources');
   sources.replaceChildren();
   for(const [id,source] of Object.entries(data.sources)){
    if(!data.matches.some(m=>m.source===id||m.extra_sources?.includes(id)))continue;
    const link=el('a',source.label,'verified-source');
    const url=String(source.url||'');
    if(/^https:\/\//.test(url)){link.href=url;link.target='_blank';link.rel='noopener noreferrer';sources.append(link);}
   }
   const render=tier=>{
    const items=data.matches.filter(x=>tier==='all'||x.tier===tier)
     .sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
    $('v-count').textContent=items.length+' / '+data.matches.length+' meczów';
    rootNode.replaceChildren(...items.map(m=>build(m,data.sources)));
   };
   $('v-filters').querySelectorAll('[data-tier]').forEach(btn=>btn.addEventListener('click',()=>{
    $('v-filters').querySelectorAll('[data-tier]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));
    render(btn.dataset.tier);
   }));
   render('all');
  }catch(err){
   $('verified-date-state').textContent='Brak potwierdzonych danych';
   rootNode.replaceChildren(el('p','Nie można sprawdzić źródłowej listy: '+String(err.message||err)+'. Nie wyświetlamy niezweryfikowanych typów.','verified-error'));
  }
 }
 const api={scoreObserved,explainObserved,dateStatus};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root&&root.document)document.addEventListener('DOMContentLoaded',load);
})(typeof window!=='undefined'?window:null);
