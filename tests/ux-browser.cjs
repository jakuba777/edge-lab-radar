'use strict';
// Browser-level regression using Chrome DevTools Protocol, no external dependencies.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn,spawnSync}=require('node:child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const root=path.resolve('site');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let p=path.join(root,url.pathname==='/'?'index.html':url.pathname);
 if(/^\/src\/(value-engine-v2|dual-engine|multi-market|market-labels)\.js$/.test(url.pathname))p=path.join(path.dirname(root),url.pathname);
 if(!p.startsWith(root+path.sep)&&!p.startsWith(path.join(path.dirname(root),'src')+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(p,(err,data)=>{if(err){res.writeHead(404).end();return;}
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.json':'application/json','.csv':'text/csv','.svg':'image/svg+xml'}[path.extname(p)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':mime});res.end(data);
 });
});
(async()=>{
 let chrome,ws,dir;
 try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const executable=['google-chrome','chromium','chromium-browser'].find(x=>spawnSync('which',[x]).status===0);
 assert.ok(executable,'Chrome/Chromium required');
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'edge-ux-'));
 let chromeError='';
 chrome=spawn(executable,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:['ignore','ignore','pipe']});
 chrome.stderr.on('data',d=>{chromeError=(chromeError+d.toString()).slice(-4000);});
 for(let i=0;i<300&&!fs.existsSync(path.join(dir,'DevToolsActivePort'))&&chrome.exitCode===null;i++)await delay(100);
 assert.ok(fs.existsSync(path.join(dir,'DevToolsActivePort')),'Chrome did not start: '+chromeError);
 const port=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 let id=0;const pending=new Map();
 ws.addEventListener('message',ev=>{const msg=JSON.parse(ev.data);if(pending.has(msg.id)){const cb=pending.get(msg.id);pending.delete(msg.id);msg.error?cb.reject(Error(msg.error.message)):cb.resolve(msg.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 await send('Page.enable');
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const paths=fs.readdirSync(root).filter(p=>p.endsWith('.html')).sort();
 assert.equal(paths.length,16,'full page coverage');
 for(const width of [320,390,768]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
 for(const page of paths){
  await send('Page.navigate',{url:base+'/'+page});
  for(let i=0;i<100;i++){try{if(await evaluate("document.readyState==='complete'&&location.pathname.endsWith('/"+page+"')"))break;}catch{} await delay(40);}
  const a=await evaluate(`(()=>{const n=document.querySelector('.editorial-nav'),r=n.getBoundingClientRect(),links=[...n.querySelectorAll('a')].map(x=>x.getBoundingClientRect());return {theme:getComputedStyle(document.body).backgroundColor,links:links.length,rows:new Set(links.map(x=>Math.round(x.top))).size,navBottom:r.bottom,viewport:innerHeight,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,touch:Math.min(...links.map(x=>x.height))}})()`);
  assert.equal(a.theme,'rgb(243, 246, 250)',page+' '+width+' theme');assert.equal(a.links,4);assert.equal(a.rows,1,page+' nav wrap');assert.ok(Math.abs(a.navBottom-a.viewport)<=2,page+' nav bottom '+JSON.stringify(a));assert.ok(a.touch>=44,page+' touch height');assert.ok(a.overflow<=2,page+' '+width+' horizontal overflow '+JSON.stringify(a));
  if(page==='index.html'){
   assert.equal(await evaluate("getComputedStyle(document.querySelector('.tabbar')).position"),'static');
   await evaluate("document.querySelector('[data-screen=matches]').click()");
   assert.equal(await evaluate("document.querySelector('#screen-matches').classList.contains('is-active')&&document.querySelector('[data-screen=matches]').getAttribute('aria-pressed')==='true'"),true);
  }
  if(page==='analiza.html'){
   const match=await evaluate(`(()=>{const x=document.createElement('button');x.className='match';x.innerHTML='<span class="match-teams">Bardzo długa nazwa drużyny – Druga bardzo długa nazwa</span><small>18:30 · test</small><span class="match-state">Za mało danych</span>';document.querySelector('#matches').replaceChildren(x);const a=x.children[0].getBoundingClientRect(),b=x.children[2].getBoundingClientRect();return {position:getComputedStyle(x.children[2]).position,overlap:a.right>b.left+1}})()`);
   assert.equal(match.position,'static');assert.equal(match.overlap,false);
  }
  if(page==='kupony.html'){
   const colors=await evaluate(`(()=>{const x=document.createElement('div');x.className='coupon-card';x.innerHTML='<div class="coupon-leg"><span class="teams">Test</span><span class="prob">67%</span></div>';document.querySelector('.coupon-shell').append(x);return [getComputedStyle(x).backgroundColor,getComputedStyle(x.querySelector('.teams')).color,getComputedStyle(x.querySelector('.prob')).color]})()`);
   assert.deepEqual(colors,['rgb(255, 255, 255)','rgb(20, 34, 54)','rgb(17, 100, 84)']);
  }
  console.log('PASS',width,page);
 }
 }
 }finally{if(ws)ws.close();if(chrome)chrome.kill();server.close();if(dir){await delay(200);try{fs.rmSync(dir,{force:true,recursive:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
