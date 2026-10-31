import json
import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class CouponDiversityTests(unittest.TestCase):
    def test_simulations_reject_near_duplicate_events_and_keep_singles_separate(self):
        js = r'''
const C = require(process.argv[1]);
const leg = (id, market='o15') => ({match:{id},id:market,p:.76});
const scenario = (...xs) => ({legs:xs.map(k=>leg(k)),score:.9});
const choices = C.diversifyCoupons([
  scenario('A','B'), scenario('A','C'), scenario('C','D'),
  scenario('E','F'), scenario('A','E')
], 5);
const models = [];
for(let i=0;i<5;i++){
 const ps=Object.fromEntries(C.MARKETS.map(x=>[x.id,.75]));
 const base=Object.fromEntries(C.MARKETS.map(x=>[x.id,.74]));
 models.push({id:'research-'+i,date:'2026-11-05',home:'H'+i,
  away:'A'+i,leagueId:'L'+i,league:'Test Liga '+i,
  model:{ps,base,nH:9,nA:8,nLeague:120}});
}
const singles=C.createCoupons(models,'single',1,6);
console.log(JSON.stringify({
  combos:choices.map(x=>x.legs.map(leg=>leg.match.id).sort().join(',')),
  singles:singles.map(x=>({profile:x.profile,type:x.type,len:x.legs.length,
    id:x.legs[0].match.id,market:x.legs[0].id}))
}));
'''
        p = subprocess.run(
            ["node", "-e", js, str(ROOT / "site/assets/coupon-core.js")],
            capture_output=True, text=True, check=True
        )
        result = json.loads(p.stdout)
        self.assertEqual(result["combos"], ["A,B", "C,D", "E,F"])
        self.assertEqual(len(result["singles"]), 5)
        self.assertEqual(len({s["id"] for s in result["singles"]}), 5)
        self.assertTrue(all(s["profile"] == "single" and s["len"] == 1
                            for s in result["singles"]))
        self.assertLessEqual(max(
            sum(x["market"] == m for x in result["singles"])
            for m in {x["market"] for x in result["singles"]}
        ), 2)


if __name__ == "__main__":
    unittest.main()
