const assert = require("node:assert/strict");
const { buildDual } = require("../src/dual-engine.js");
const timestamp = "2026-11-01T12:00:00Z";
function fixture(matchId, track, odds, probability) {
  return { matchId, track, odds, probability, lowerProbability: probability - 0.03,
    oddsTimestamp: timestamp, evaluatedAt: "2026-11-01T12:10:00Z",
    calibrated: true, calibrationEvidence: { verified: true, datasetId: "synthetic-test-only",
      method: "fixture", sampleSize: 300 }, modelVersion: "test-only", marketId: "over25" };
}
const inputs = [
  fixture("a","A",1.7,0.78), fixture("b","A",1.7,0.78),
  fixture("c","B",2.1,0.66), fixture("d","B",2.1,0.66),
  fixture("e","B",2.1,0.66)
];
const output = buildDual(inputs);
assert.ok(output.stable.length > 0, "expected stable candidates");
assert.ok(output.highOdds.length > 0, "expected high odds candidates");
for (const coupon of [...output.stable, ...output.highOdds]) {
  assert.equal(coupon.combinedProbability, null);
  assert.equal(coupon.combinedExpectedRoi, null);
  assert.equal(new Set(coupon.selections.map(x => x.matchId)).size, coupon.selections.length);
}
assert.ok(output.highOdds.every(x => x.combinedOdds >= 6 && x.combinedOdds <= 10));
assert.equal(buildDual([]).highOdds.length, 0);
assert.equal(buildDual(inputs.map(x => ({ ...x, calibrated: false }))).stable.length, 0);
assert.equal(buildDual(inputs.map(x=>({...x,modelVersion:"DEMO-SYNTHETIC"}))).stable.length,0);
assert.ok(buildDual(inputs.map(x=>({...x,modelVersion:"DEMO-SYNTHETIC"})),{allowDemo:true}).stable.length>0);
console.log("EDGE LAB DUAL: assertions passed");
