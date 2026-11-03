'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const style=fs.readFileSync('site/assets/contrast-v21.css','utf8');
const rgb=hex=>{
 const v=hex.replace('#','');const full=v.length===3?[...v].map(x=>x+x).join(''):v;
 return [0,2,4].map(i=>parseInt(full.slice(i,i+2),16)/255);
};
const luminosity=hex=>rgb(hex).reduce((sum,v,i)=>sum+(v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4)*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const [hi,lo]=[luminosity(a),luminosity(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);};
for(const [name,foreground,background] of [
 ['dark card heading','#f3f8fa','#141f30'],
 ['dark card secondary','#b8cbd2','#141f30'],
 ['dark sports card heading','#f3f8fa','#0c1c2b'],
 ['dark sports card figures','#b5f2e6','#0c1c2b'],
 ['light card heading','#172922','#ffffff'],
 ['light card secondary','#52695b','#ffffff'],
 ['light app secondary','#52695b','#f5f6f2'],
 ['green text on light card','#245d4e','#ffffff'],
 ['price rationale','#304c3b','#e9f3ec'],
 ['risk text','#664a22','#fbf0dd']
])assert.ok(contrast(foreground,background)>=4.5,name+' contrast '+contrast(foreground,background).toFixed(2));
for(const [page,legacy] of [
 ['index.html','edge-feature.css'],['kupony.html','kupony.css'],
 ['skutecznosc.html','track.css'],['analiza.html','analiza.css'],
 ['rynek.html','market.css']
]){
 const html=fs.readFileSync('site/'+page,'utf8');
 assert.match(html,/assets\/contrast-v21\.css\?v=21/,page+' missing new contrast stylesheet');
 const styles=[...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(x=>x[0]);
 assert.ok(styles.at(-1).includes('contrast-v21.css'),page+' contrast stylesheet must load last');
 assert.ok(html.includes('assets/'+legacy),page+' lost legacy CSS');
 assert.ok(html.indexOf('assets/'+legacy)<html.indexOf('assets/contrast-v21.css'),page+' legacy CSS after contrast');
 assert.ok(html.indexOf('assets/editorial.css')<html.indexOf('assets/contrast-v21.css'),page+' editorial must precede contrast');
}
for(const selector of [
 '.coupon-warning a','.coupon-audit-link','.coupon-method :is(p,strong,a)',
 '.coupon-today-toggle','.coupon-card .coupon-real label','.coupon-card .coupon-cardhead',
 '.coupon-evening-card','.track-entry :is(h3,strong,.score)', '.track-daily-label',
 '.track-explainer p','.market-output .snapshot strong',
 '.price-lab .price-lab-reason','.coupon-leg-rationale'
])assert.ok(style.includes(selector),'missing targeted regression rule: '+selector);
assert.doesNotMatch(style,/body:has\(\.editorial-nav\) \.muted:not\(\.chip\)/,
 'must not force dark-colored helper text into dark nested cards');
console.log('5 primary pages: stylesheet order, known contrast failures, and WCAG AA palette passed');
