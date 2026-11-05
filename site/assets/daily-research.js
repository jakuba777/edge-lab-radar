'use strict';
/* EDGE LAB daily UEFA models — informational only; no market odds, bets, or proven EV. */
(async function(){
 const host=document.getElementById('daily-research');if(!host)return;
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const el=(tag,t)=>{const n=document.createElement(tag);if(t!==undefined)n.textContent=String(t);return n;};
 const fmt=p=>(100*p).toFixed(1).replace('.',',')+'%';
 host.replaceChildren();
 const box=el('div');box.append(el('strong','Analizy dzisiejszych meczów · '+date));host.append(box);
 try{
  const r=await fetch('./data/daily-watchlist.json',{cache:'no-store',credentials:'omit',mode:'same-origin'});if(!r.ok)throw Error('unavailable');
  const d=await r.json();if(d.date!==date||!Array.isArray(d.matches)||d.matches.length===0){box.append(el('p','Brak zweryfikowanej listy na dzisiejszą datę.'));return;}
  box.append(el('p',d.matches.length+' spotkań UEFA · model Poissona · analiza eksperymentalna, nie gotowe zakłady.'));
  const note=el('p','Uwaga: zaledwie 2–3 mecze historyczne na drużynę. Wyniki są wygładzone, nieskalibrowane i bez aktualnych kursów. Brak potwierdzonego EV.');note.style.cssText='font-size:13px;color:#4a5b52';box.append(note);
  const labels={o15:'Over 1,5',o25:'Over 2,5',u35:'Under 3,5',btts:'BTTS',h2:'Gospodarze 2+ gole',a2:'Goście 2+ gole'};
  const list=el('div');list.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:14px';
  for(const m of [...d.matches].sort((a,b)=>a.time.localeCompare(b.time)||b.top_market.p-a.top_market.p)){
   const card=el('article');card.style.cssText='padding:14px;background:#fff;border:1px solid #d7dfda;border-radius:12px;color:#17251e';
   const title=el('strong',m.home+' – '+m.away);card.append(el('small',m.time+' · '+(m.competition==='EL'?'Liga Europy':'Liga Konferencji')),el('div'));card.lastChild.append(title);
   const prob=m.probabilities;
   card.append(el('p','Model goli: '+m.lambda_home.toFixed(2)+' – '+m.lambda_away.toFixed(2)));
   card.append(el('p','1X2: '+fmt(prob.home)+' / '+fmt(prob.draw)+' / '+fmt(prob.away)));
   card.append(el('p','BTTS '+fmt(prob.btts)+' · O1,5 '+fmt(prob.o15)+' · O2,5 '+fmt(prob.o25)+' · U3,5 '+fmt(prob.u35)));
   const summary=el('p','Najwyższy szacunek: '+(labels[m.top_market.market]||m.top_market.market)+' '+fmt(m.top_market.p));summary.style.cssText='font-weight:700;color:#215740';card.append(summary);
   const details=el('details');details.append(el('summary','Próba i ograniczenia'));details.append(el('p','Historia UEFA: '+m.home_sample.n+' meczów, '+m.home_sample.scored+' zdobytych / '+m.home_sample.conceded+' straconych; '+m.away_sample.n+' meczów rywala, '+m.away_sample.scored+' zdobytych / '+m.away_sample.conceded+' straconych. Nie uwzględnia składów, aktualnych kursów ani kontuzji.'));card.append(details);
   list.append(card);
  }
  host.append(list);
  const src=el('p','Źródła wyników i terminarza: ');for(const [k,url] of Object.entries(d.sources)){const a=el('a',k==='EL'?'UEFA Liga Europy':'UEFA Liga Konferencji');a.href=url;a.target='_blank';a.rel='noopener noreferrer';src.append(a,el('span',' · '));}host.append(src);
 }catch(_){box.append(el('p','Brak aktualnej listy modelowej.'));}
})();