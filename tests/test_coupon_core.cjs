'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const core = require('../site/assets/coupon-core.js');

test('all 16 markets are uniquely identified', () => {
  assert.equal(core.MARKETS.length,16);
  assert.equal(new Set(core.MARKETS.map(m=>m.id)).size,16);
});

test('baseline rather than uncalibrated model drives ordinary candidates', () => {
  const match={id:'m1',date:'2026-11-09',leagueId:'l1',model:{
    ps:{hg:.99,ag:.99,o15:.99,u35:.99,oneX:.99,x2:.99},
    base:{hg:.75,ag:.75,o15:.75,u35:.75,oneX:.75,x2:.75},
    nH:10,nA:10,nLeague:100
  }};
  const candidates=core.candidatesFor(match,'selective');
  assert.ok(candidates.length>0);
  for(const candidate of candidates){
    assert.equal(candidate.p,.75);
    assert.equal(candidate.rawP,.99);
    assert.equal(candidate.diff,.24);
  }
});

test('no same-day or future results can influence analysis',()=>{
  const match={date:'2026-11-09',home:'A',away:'B'};
  const history=[];
  for(let i=0;i<60;i++)history.push({
    date:'2026-11-01',home:i%2?'C':'A',away:i%2?'B':'D',hs:1,as:1
  });
  const before=core.analyze(match,history);
  assert.ok(before);
  const after=core.analyze(match,[...history,
    {date:'2026-11-09',home:'A',away:'B',hs:14,as:0},
    {date:'2026-11-10',home:'A',away:'B',hs:14,as:0}
  ]);
  assert.deepEqual(after,before);
});

test('same-match markets are not multiplied as independent',()=>{
  const rows=core.grid(1.4,1.1);
  const joint=core.jointSameGame(rows,['btts','o25']);
  const product=core.marketP(rows,'btts')*core.marketP(rows,'o25');
  assert.ok(joint>0&&joint<1);
  assert.notEqual(joint,product);
});

test('separate-event coupons reject duplicate match IDs',()=>{
  assert.ok(Number.isNaN(core.jointSeparate([
    {match:{id:'same'},p:.7},{match:{id:'same'},p:.8}
  ])));
});

test('tax-adjusted threshold is consistent',()=>{
  assert.ok(Math.abs(core.quoteThreshold(.5)-1/(.5*.88))<1e-10);
});
