const assert = require("node:assert/strict");
const { evaluate, validateCoupon } = require("../src/value-engine-v2.js");
const base = { odds: 2.2, probability: .65, lowerProbability: .60,
  oddsTimestamp: "2026-11-01T12:00:00Z", evaluatedAt: "2026-11-01T12:10:00Z",
  calibrated: true, modelVersion: "test-v1", matchId: "m1", marketId: "over25" };
assert.equal(evaluate(base).status, "VALUE_CANDIDATE");
assert.ok(Math.abs(evaluate(base).expectedRoi - (.65*2.2*.88-1)) < 1e-12);
assert.equal(evaluate({...base,lowerProbability:.4}).status, "NO_EDGE");
assert.ok(evaluate({...base,oddsTimestamp:"2026-11-01T11:00:00Z"}).reasons.includes("stale_or_missing_odds"));
assert.ok(evaluate({...base,calibrated:false}).reasons.includes("uncalibrated_model"));
assert.ok(evaluate({...base,odds:null}).reasons.includes("invalid_odds"));
assert.ok(evaluate({...base,oddsTimestamp:"2026-11-01T12:15:00Z"}).reasons.includes("stale_or_missing_odds"));
assert.ok(evaluate({...base,probability:1.2}).reasons.includes("invalid_probability"));
assert.equal(validateCoupon([{matchId:"a",status:"VALUE_CANDIDATE"},{matchId:"a",status:"VALUE_CANDIDATE"}]).valid,false);
assert.equal(validateCoupon([{matchId:"a",status:"VALUE_CANDIDATE"},{matchId:"b",status:"VALUE_CANDIDATE"}]).valid,true);
assert.equal(validateCoupon(Array.from({length:4},(_,i)=>({matchId:String(i),status:"VALUE_CANDIDATE"}))).valid,false);
assert.ok(evaluate({...base,odds:1.05}).reasons.includes("unprofitable_even_if_certain"));
const { rankCandidates, buildCoupons } = require("../src/value-engine-v2.js");
const candidate2 = {...base, matchId:"m2",odds:2.5, probability:.7,lowerProbability:.62};
assert.equal(rankCandidates([base,candidate2]).length,2);
assert.equal(buildCoupons([base,candidate2]).filter(x=>x.selections.length===2).length,1);
assert.ok(buildCoupons([base,candidate2]).every(x=>x.combinedExpectedRoi===null));
assert.equal(buildCoupons([base,{...base,marketId:"btts"}]).filter(x=>x.selections.length===2).length,0);
console.log("EDGE LAB Value Engine: 15 assertions passed");
