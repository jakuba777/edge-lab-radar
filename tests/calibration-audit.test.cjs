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
