'use strict';
(function(){
const $=id=>document.getElementById(id);
const element=(tag,text,cl)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cl)el.className=cl;return el;};
function row(where,a,b){
 const el=element('div',undefined,'ht-row');el.appendChild(element('span',a));el.appendChild(element('strong',b));where.appendChild(el);
}
async function main(){
 try{
  const response=await fetch('./data/ht_coverage.json',{cache:'no-store',credentials:'omit',mode:'same-origin'});
  if(!response.ok)throw Error('Brak opublikowanego badania ('+response.status+').');
  const data=await response.json();
  if(!Array.isArray(data.leagues)||!data.created_at_utc)throw Error('Nieprawidłowy format danych.');
  $('ht-status').textContent='Kontrola kompletności zakończona';
  $('ht-leagues').textContent=String(data.leagues.length);
  $('ht-usable').textContent=String(data.leagues_with_usable_htft||0);
  $('ht-updated').textContent='Źródło open-matchday 2026/27; audyt '+data.created_at_utc.slice(0,16).replace('T',' ')+' UTC';
  const container=$('ht-results');container.replaceChildren();
  const ordered=[...data.leagues].sort((a,b)=>Number(b.usable_for_research)-Number(a.usable_for_research)||b.htft_coverage-a.htft_coverage);
  for(const league of ordered){
   const box=element('article',undefined,'panel ht-card');
   const head=element('div',undefined,'between');
   head.appendChild(element('h3',league.name));
   const status=element('span',league.usable_for_research?'Można badać':'Brak próby','ht-chip'+(league.usable_for_research?' good':''));
   head.appendChild(status);box.appendChild(head);
   row(box,'Poprawne wyniki HT/FT',league.matches_with_valid_htft+' / '+league.matches_with_results);
   row(box,'Pokrycie pól HT',Math.round(league.htft_coverage*100)+'%');
   if(league.usable_for_research){
    row(box,'Zaobserwowane 2/1',league.reversal_2_1+' ('+(league.reversal_2_1/league.matches_with_valid_htft*100).toFixed(1).replace('.',',')+'%)');
    row(box,'Zaobserwowane 1/2',league.reversal_1_2+' ('+(league.reversal_1_2/league.matches_with_valid_htft*100).toFixed(1).replace('.',',')+'%)');
    row(box,'Śr. gole w 2. połowie',String(league.average_second_half_goals).replace('.',','));
   }else box.appendChild(element('p','Za mało poprawnych danych, by prezentować częstotliwość zdarzeń. Nie uzupełniamy braków domysłami.','caption'));
   container.appendChild(box);
  }
  if(!ordered.length)container.appendChild(element('div','Nie znaleziono danych.','panel empty'));
 }catch(err){
  $('ht-status').textContent='Brak wiarygodnego raportu';
  $('ht-error').classList.remove('hidden');$('ht-error').textContent=String(err.message||err);
  $('ht-results').replaceChildren(element('div','Nie pokazujemy fikcyjnych wyników.','panel empty'));
 }
}
document.addEventListener('DOMContentLoaded',main);
})();