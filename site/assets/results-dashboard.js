'use strict';
(function(root){
 const $=id=>document.getElementById(id);
 const dateOffset=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const pct=(x,n=1)=>x===null||!Number.isFinite(x)?'—':(x*100).toFixed(n).replace('.',',')+'%';
 const escCsv=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const sourceKeys={main:'main',single:'single_research',coupons:'simulated_coupons',ht:'halftime_research'};
 const summarize=rows=>{const scored=rows.filter(x=>x.state==='hit'||x.state==='miss');const hit=scored.filter(x=>x.state==='hit').length;return {hit,miss:scored.length-hit,scored:scored.length,pending:rows.filter(x=>x.state==='pending').length,hit_rate:scored.length?hit/scored.length:null};};
 const sumDays=(days)=>{let hit=0,miss=0,pending=0;for(const x of days){hit+=x.hit||0;miss+=x.miss||0;pending+=x.pending||0;}const scored=hit+miss;return {hit,miss,pending,scored,hit_rate:scored?hit/scored:null};};
 function periodDates(today,range,allDays){
  if(range==='archive')return allDays.filter(d=>d<today).sort().reverse();
  const start=dateOffset(today,range==='yesterday'?-1:range==='fortnight'?-14:range==='month'?-30:-7);
  return allDays.filter(d=>d>=start&&d<today).sort().reverse();
 }
 function element(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;}
 function init(data){
  const daily=data.daily||{}, entries=data.entries||{}, today=data.settle_only_dates_before_warsaw;
  if(!/^20\d\d-\d\d-\d\d$/.test(today||''))throw Error('Brak daty rozliczenia w raporcie.');
  let currentRows=[];
  const render=()=>{
   const kind=$('dash-kind').value,range=$('dash-range').value,status=$('dash-status').value;
   const search=$('dash-search').value.trim().toLocaleLowerCase('pl');
   const dates=periodDates(today,range,Object.keys(daily[kind]||{}));
   const totals=sumDays(dates.map(d=>daily[kind][d]));
   const summary=$('dash-summary');summary.replaceChildren();
   for(const [name,value] of [['Trafione',totals.hit],['Nietrafione',totals.miss],['Skuteczność',pct(totals.hit_rate)],['Oczekujące',totals.pending],['Rozliczone',totals.scored]]){
    const card=element('div',undefined,'track-dash-card');card.append(element('small',name),element('strong',value));summary.appendChild(card);
   }
   const dayRoot=$('dash-days');dayRoot.replaceChildren();
   if(!dates.length)dayRoot.appendChild(element('p','Brak zapisanych prognoz w tym okresie.','caption'));
   for(const day of dates.slice(0,range==='archive'?45:range==='month'?30:range==='fortnight'?14:7)){
    const d=daily[kind][day],row=element('div',undefined,'track-dash-day');
    const left=element('div');left.append(element('strong',day),element('small',(d.hit||0)+' trafień / '+(d.miss||0)+' pomyłek · '+(d.pending||0)+' oczekuje'));
    const right=element('strong',pct(d.hit_rate));row.append(left,right);dayRoot.appendChild(row);
   }
   const key=sourceKeys[kind],source=entries[key]||[],allowed=new Set(dates);
   currentRows=source.filter(r=>allowed.has(r.date)&& (status==='all'||r.state===status) &&
     (!search||JSON.stringify([r.home,r.away,r.league,r.market,r.label,r.profile,...(r.legs||[]).map(l=>[l.home,l.away,l.label])]).toLocaleLowerCase('pl').includes(search)));
   currentRows.sort((a,b)=>b.date.localeCompare(a.date)||String(a.home||'').localeCompare(String(b.home||'')));
   const list=$('dash-results');list.replaceChildren();
   if(!currentRows.length)list.appendChild(element('p','Brak wpisów spełniających kryteria.','caption'));
   for(const r of currentRows.slice(0,100)){
    const card=element('article',undefined,'track-dash-result');
    const title=kind==='coupons'||kind==='single'?(r.legs||[]).map(l=>l.home+' – '+l.away).join(' / '):r.home+' – '+r.away;
    const head=element('div',undefined,'track-dash-result-head');
    head.append(element('strong',title||'Symulacja'),element('span',r.state==='hit'?'TRAFIONY':r.state==='miss'?'NIETRAFIONY':'OCZEKUJE','track-dash-state '+r.state));card.appendChild(head);
    card.appendChild(element('small',r.date+' · '+(r.league||r.profile||'')+' · '+(r.label||r.market||'')));
    if(r.legs)for(const l of r.legs)card.appendChild(element('div',(l.label||l.market)+' · '+l.home+' – '+l.away+' · '+(l.score||'brak wyniku'),'track-dash-leg'));
    card.appendChild(element('div','P: '+pct(r.p)+' · '+(r.score?'Wynik '+r.score:'Wynik niepotwierdzony'),'track-dash-meta'));
    list.appendChild(card);
   }
   const shown=currentRows.length;
   $('dash-coverage').textContent='Widoczne wpisy: '+Math.min(shown,100)+' z '+shown+' pasujących do filtra. Suma okresu obejmuje pełne archiwum dostępne dla raportu; lista szczegółowa może być ograniczona do 1800 rekordów na kategorię. Nie wyliczamy ROI bez kursów.';
  };
  for(const id of ['dash-kind','dash-range','dash-status','dash-search'])$(id).addEventListener(id==='dash-search'?'input':'change',render);
  $('dash-export').addEventListener('click',()=>{
   const rows=[['data','status','typ','liga','gospodarze','goscie','rynek','p','wynik']];
   for(const r of currentRows)rows.push([r.date,r.state,$('dash-kind').value,r.league||r.profile||'',r.home||(r.legs||[]).map(l=>l.home).join(' / '),r.away||(r.legs||[]).map(l=>l.away).join(' / '),r.label||r.market||(r.legs||[]).map(l=>l.market).join(' / '),r.p,r.score||'']);
   const csv='\uFEFF'+rows.map(x=>x.map(escCsv).join(';')).join('\r\n');
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download='edge-lab-wyniki-'+$('dash-range').value+'.csv';a.click();URL.revokeObjectURL(url);
  });
  render();
 }
 async function main(){
  try{const response=await fetch('./data/track_record.json',{cache:'no-store'});if(!response.ok)throw Error('Raport niedostępny (HTTP '+response.status+').');
   const data=await response.json();if(data.status!=='ready'||!data.daily)throw Error('Raport wymaga ponownego wygenerowania z nową strukturą statystyk dziennych.');
   init(data);
  }catch(err){$('dash-summary').textContent=String(err.message||err);$('dash-days').textContent='Nie pokazujemy szacowanych wyników bez danych.';$('dash-results').textContent='';}
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={periodDates,sumDays,summarize};
 if(root&&root.document)document.addEventListener('DOMContentLoaded',main);
})(typeof window!=='undefined'?window:undefined);
