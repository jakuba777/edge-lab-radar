'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('site/assets/ux-v3.css','utf8');
const pages=["index","analiza","kupony","skutecznosc","rynek","jutro","lamaki","live","modele","moje-zaklady","scenariusze","weryfikacja","dzisiaj-2026-11-05","value-lab","dual-lab","multi-market-lab"];
test('one shared theme and four primary links on every screen',()=>{
 for(const p of pages){
  const html=fs.readFileSync('site/'+p+'.html','utf8');
  assert.match(html,/<body class="edge-v3/);
  const links=[...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]);
  assert.match(links.at(-1),/ux-v3\.css/);
  const navs=[...html.matchAll(/<nav class="editorial-nav"[\s\S]*?<\/nav>/g)];
  assert.equal(navs.length,1,p);
  assert.equal((navs[0][0].match(/<a /g)||[]).length,4,p);
 }
});
test('today tabs are in content with accessible selection and no duplicated destinations',()=>{
 const html=fs.readFileSync('site/index.html','utf8');
 assert.ok(html.indexOf('class="tabbar"')<html.indexOf('id="screen-today"'));
 const tab=html.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)[0];
 assert.equal((tab.match(/data-screen=/g)||[]).length,4);assert.doesNotMatch(tab,/<a /);
 assert.equal((tab.match(/aria-pressed="true"/g)||[]).length,1);
 assert.match(fs.readFileSync('site/assets/app.js','utf8'),/setAttribute\('aria-pressed'/);
});
test('palette contrast and safe layout declarations',()=>{
 const lum=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 for(const [a,b] of [['#142236','#ffffff'],['#46576c','#f3f6fa'],['#ffffff','#116454'],['#116454','#e3f3ec'],['#75450c','#fff4df'],['#9b352b','#fce9e5']]){
 const [hi,lo]=[lum(a),lum(b)].sort((x,y)=>y-x);assert.ok((hi+.05)/(lo+.05)>=4.5,a+' on '+b);
 }
 assert.match(css,/\.tabbar\{position:static!important/);
 assert.match(css,/\.hub-selection\{position:static!important/);
 assert.match(css,/\.match-state\{position:static!important/);
 assert.match(css,/safe-area-inset-bottom/);assert.match(css,/focus-visible/);
});
