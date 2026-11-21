const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calibration}=require('../site/assets/calibration-audit.js');
test('deduplicates and rejects invalid probabilities; ignores pending',()=>{
 const r={date:'2026-11-20',league:'L',home:'A',away:'B',market:'m',p:.8,state:'hit'};
 const a=calibration([r,r,{...r,home:'C',p:1.2},{...r,home:'D',state:'pending'},{...r,home:'E',state:'miss'}]);
 assert.equal(a.rejected,2);assert.equal(a.bins[8].n,2);assert.equal(a.bins[8].y,1);
 assert.ok(Math.abs(a.bins[8].brier-.68)<1e-10);
});
test('probability boundaries remain finite',()=>{
 const r={date:'2026-11-20',league:'L',home:'A',away:'B',p:1,state:'miss'};
 const a=calibration([r,{...r,home:'C',p:0,state:'hit'}]);
 assert.equal(a.bins[9].n,1);assert.equal(a.bins[0].n,1);assert.ok(Number.isFinite(a.bins[9].loss));
});


test('separates markets and rejects snapshots on match day in Warsaw',()=>{
 const {describe}=require('../site/assets/calibration-audit.js');
 const r={date:'2026-11-21',league:'L',home:'A',away:'B',market:'o25',p:.8,state:'hit',snapshot_utc:'2026-11-19T12:00:00Z'};
 const a=calibration([r,r,{...r,home:'C',state:'miss'},{...r,home:'D',snapshot_utc:'2026-11-20T23:01:00Z'},{...r,home:'E',market:'btts',p:.6}],{strict:true});
 assert.equal(a.rejected,2);assert.equal(a.markets.length,2);
 assert.ok(Math.abs(describe(a.markets.find(x=>x.market==='o25')).brier-.34)<1e-10);
 assert.equal(describe(a.markets[0]).smallSample,true);
});
test('conflicting duplicate is excluded entirely',()=>{
 const r={date:'2026-11-21',league:'L',home:'A',away:'B',market:'o25',p:.8,state:'hit',snapshot_utc:'2026-11-19T12:00:00Z'};
 const a=calibration([r,{...r,state:'miss'}],{strict:true});
 assert.equal(a.conflicts,1);assert.equal(a.markets.length,0);assert.equal(a.rejected,2);
});
