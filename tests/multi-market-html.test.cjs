const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const html=fs.readFileSync("multi-market-lab.html","utf8");
assert.match(html,/src\/multi-market\.js/);
assert.match(html,/aria-live="polite"/);
assert.match(html,/new Date\(\)\.toISOString\(\)/);
assert.match(html,/replaceChildren\(\)/);
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
for(const s of scripts)new vm.Script(s);
console.log("MULTI MARKET HTML: syntax and dependencies OK");