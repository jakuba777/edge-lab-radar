'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');const d=require('../site/assets/results-dashboard.js');
test('yesterday uses calendar date not last available result',()=>{assert.deepEqual(d.periodDates('2026-11-07','yesterday',['2026-11-05','2026-11-06','2026-11-07']),['2026-11-06']);});
test('week covers seven preceding completed calendar days',()=>{assert.deepEqual(d.periodDates('2026-11-07','week',['2026-10-30','2026-10-31','2026-11-01','2026-11-06','2026-11-07']),['2026-11-06','2026-11-01','2026-10-31']);});
test('daily aggregates do not count pending as misses',()=>{assert.deepEqual(d.sumDays([{hit:3,miss:2,pending:4},{hit:1,miss:0,pending:1}]),{hit:4,miss:2,pending:5,scored:6,hit_rate:4/6});});
test('no scored events displays unavailable percentage',()=>{assert.equal(d.sumDays([{hit:0,miss:0,pending:2}]).hit_rate,null);});
