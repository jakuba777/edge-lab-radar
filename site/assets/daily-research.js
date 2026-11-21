'use strict';
/* Coverage only; computed from the same synchronized sources as the main page. */
(function(){
 const host=document.getElementById('daily-research');if(!host)return;
 const el=(tag,t)=>{const e=document.createElement(tag);e.textContent=t;return e;};
 document.addEventListener('edge:coverage',({detail:d})=>{
  host.replaceChildren();
  const root=el('div','');root.append(el('strong','Dzisiejsze dane · '+d.day));host.append(root);
  if(d.error||d.stale){root.append(el('p','Brak aktualnych danych lub nieprawidłowy czas synchronizacji.'));return;}
  root.append(el('p','Ligi: '+d.leagues+'/'+d.declaredLeagues+' · terminarz dziś: '+d.fixtures+' · dostępny model: '+d.modeled+' · wyniki źródłowe: '+d.settled));
  root.append(el('p',d.ageHours>8?'Źródło ma ponad 8 godzin: pozostałe mecze dziś nie są potwierdzone.':'Pozostałe według godzin źródłowych: '+d.remaining+' (strefa i status LIVE niepotwierdzone).'));
  root.append(el('p','Pokrycie dotyczy dostępnej bazy, nie całej oferty bukmacherskiej. Prognozy eksperymentalne, bez gwarancji przewagi.'));
 });
})();
