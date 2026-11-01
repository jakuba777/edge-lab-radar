/* EDGE LAB Value Engine v2: pure calculations, no network, no betting. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EdgeValueEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const valid = x => typeof x === "number" && Number.isFinite(x);
  function evaluate(input) {
    const { odds, probability, lowerProbability, taxRate = 0.12,
      oddsTimestamp, evaluatedAt, maxAgeMinutes = 30, marketStatus = "open",
      calibrated = false, modelVersion, matchId, marketId } = input || {};
    const errors = [];
    if (!valid(odds) || odds <= 1) errors.push("invalid_odds");
    if (!valid(probability) || probability < 0 || probability > 1) errors.push("invalid_probability");
    if (!valid(lowerProbability) || lowerProbability < 0 || lowerProbability > probability) errors.push("invalid_lower_bound");
    if (!valid(taxRate) || taxRate < 0 || taxRate >= 1) errors.push("invalid_tax");
    if (!valid(maxAgeMinutes) || maxAgeMinutes <= 0) errors.push("invalid_max_age");
    const now = Date.parse(evaluatedAt || "");
    const timestamp = Date.parse(oddsTimestamp || "");
    if (!Number.isFinite(now) || !Number.isFinite(timestamp) || timestamp > now ||
      now - timestamp > maxAgeMinutes * 60000) errors.push("stale_or_missing_odds");
    if (marketStatus !== "open") errors.push("market_not_open");
    if (!calibrated) errors.push("uncalibrated_model");
    if (!modelVersion || !matchId || !marketId) errors.push("missing_provenance");
    if (errors.length) return { status: "NO_EDGE", reasons: errors };
    const multiplier = odds * (1 - taxRate);
    const expectedRoi = probability * multiplier - 1;
    const conservativeRoi = lowerProbability * multiplier - 1;
    return {
      status: conservativeRoi > 0 ? "VALUE_CANDIDATE" : "NO_EDGE",
      reasons: conservativeRoi > 0 ? [] : ["nonpositive_conservative_roi"],
      impliedProbability: 1 / odds,
      breakEvenProbability: 1 / multiplier,
      expectedRoi, conservativeRoi,
      matchId, marketId, modelVersion
    };
  }
  function validateCoupon(selections, maxLegs = 3) {
    if (!Array.isArray(selections) || selections.length < 1 || selections.length > maxLegs)
      return { valid: false, reasons: ["invalid_leg_count"] };
    const ids = selections.map(x => x && x.matchId);
    if (ids.some(x => !x)) return { valid: false, reasons: ["missing_match_id"] };
    if (new Set(ids).size !== ids.length) return { valid: false, reasons: ["duplicate_match"] };
    if (selections.some(x => x.status !== "VALUE_CANDIDATE"))
      return { valid: false, reasons: ["non_value_selection"] };
    return { valid: true, reasons: [] };
  }
  return Object.freeze({ evaluate, validateCoupon });
});
