import json
import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class DailyHigherThresholdTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        program = r'''
const C=require(process.argv[1]);
const matches=[];
for(let i=0;i<12;i++){
 const p=.45;
 const ps=Object.fromEntries(C.MARKETS.map(x=>[x.id,p]));
 const base=Object.fromEntries(C.MARKETS.map(x=>[x.id,.46]));
 const date=i<7?'2026-11-02':'2026-11-03';
 matches.push({id:'M'+i,date,home:'H'+i,away:'A'+i,
  leagueId:'L'+(i%4),league:'Liga '+(i%4),
  model:{ps,base,nH:9,nA:8,nLeague:100}});
}
const forDay=C.forSelectedDay(matches,'2026-11-02');
const next=C.forSelectedDay(matches,'2026-11-03');
const daily=C.createCoupons(forDay,'high_odds',2,6,{minThreshold:5});
const triple=C.createCoupons(forDay,'high_odds',3,6,{minThreshold:12});
const impossible=C.createCoupons(forDay,'high_odds',2,6,{minThreshold:20});
const wide=C.createCoupons(C.forSelectedDay(matches,'all'),'high_odds',2,6,{minThreshold:5});
console.log(JSON.stringify({
 todayCount:forDay.length,nextCount:next.length,
 invalidDate:C.forSelectedDay(matches,'2026-11-10').length,
 allCount:C.forSelectedDay(matches,'all').length,
 dayDates:[...new Set(forDay.map(x=>x.date))],
 coupons:daily.map(c=>({p:c.p,q:c.requiredOdds,type:c.type,profile:c.profile,
  dates:[...new Set(c.legs.map(x=>x.match.date))],
  ids:c.legs.map(x=>x.match.id)})),
 triples:triple.map(c=>({p:c.p,q:c.requiredOdds,
  dates:[...new Set(c.legs.map(x=>x.match.date))],ids:c.legs.map(x=>x.match.id)})),
 tooHigh:impossible.length,wide:wide.length
}));
'''
        p = subprocess.run(["node", "-e", program,
                            str(ROOT/"site/assets/coupon-core.js")],
                           capture_output=True, text=True, check=True)
        cls.data = json.loads(p.stdout)

    def test_selected_day_is_strict(self):
        d=self.data
        self.assertEqual(d["todayCount"],7)
        self.assertEqual(d["nextCount"],5)
        self.assertEqual(d["invalidDate"],0)
        self.assertEqual(d["allCount"],12)
        self.assertEqual(d["dayDates"],["2026-11-02"])

    def test_modeled_high_threshold_not_invented_bookmaker_quote(self):
        d=self.data
        self.assertTrue(d["coupons"],"Expected valid 2-match experiments")
        for c in d["coupons"]:
            self.assertEqual(c["profile"],"high_odds")
            self.assertEqual(c["type"],"separate")
            self.assertEqual(c["dates"],["2026-11-02"])
            self.assertEqual(len(c["ids"]),len(set(c["ids"])))
            self.assertGreaterEqual(c["q"],5)
            self.assertLessEqual(c["q"],35)
            self.assertAlmostEqual(c["q"],1/(.88*c["p"]),places=8)
        self.assertTrue(d["triples"])
        self.assertTrue(all(c["q"]>=12 and c["dates"]==["2026-11-02"] for c in d["triples"]))
        self.assertEqual(d["tooHigh"],0)

    def test_ui_provides_day_selector_and_higher_odds_options(self):
        html=(ROOT/"site/kupony.html").read_text(encoding="utf-8")
        js=(ROOT/"site/assets/kupony.js").read_text(encoding="utf-8")
        for ident in ("coupon-day","coupon-day-info","coupon-high-min","coupon-high-controls"):
            self.assertIn('id="'+ident+'"',html)
            self.assertIn("'"+ident+"'",js)
        self.assertIn('data-profile="high_odds"',html)
        self.assertIn('C.forSelectedDay(',js)
        self.assertIn('updateDayOptions()',js)
        self.assertIn('mode:\'same-origin\'',js)
        self.assertNotIn("localStorage.setItem",js)
        for name in ("coupon-core.js","kupony.js"):
            proc=subprocess.run(["node","--check",str(ROOT/"site/assets"/name)],
                               capture_output=True,text=True)
            self.assertEqual(proc.returncode,0,proc.stderr)


if __name__ == "__main__":
    unittest.main()
