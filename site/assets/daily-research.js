'use strict';
/* Date-gated, source-linked research; never treat watchlist as model predictions. */
(async function(){
 const host=document.getElementById('daily-research');if(!host)return;
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
 host.replaceChildren();
 const wrap=document.createElement('div');wrap.append(text('strong','Analizy badawcze · '+date));host.append(wrap);
 try{
  const response=await fetch('./data/daily-watchlist.json',{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('unavailable');
  const data=await response.json();
  if(data.date!==date||!Array.isArray(data.matches)||!data.matches.length){wrap.append(text('p','Brak zweryfikowanej listy na dziś. Nie pokazujemy wczorajszych meczów jako aktualnych.'));return;}
  wrap.append(text('p',data.matches.length+' spotkań do analizy · to nie są zatwierdzone prognozy ani kursy.'));
  const list=document.createElement('div');list.style.cssText='display:grid;gap:8px;margin-top:12px';
  for(const m of data.matches){const row=text('div',m.time+' · '+m.home+' – '+m.away+' · '+m.market);row.style.cssText='padding:9px 12px;background:#fff;border:1px solid #dce3df;border-radius:10px;color:#17251e;font-size:14px';list.append(row);}
  host.append(list);
 }catch(_){wrap.append(text('p','Brak aktualnej, sprawdzonej listy badawczej.'));}
})();
