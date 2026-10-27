import json
import pathlib
import subprocess
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]

class CouponTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        core=ROOT/"site/assets/coupon-core.js"
        program=r'''
const m=require(process.argv[1]);
const rows=m.grid(1.6,1.3);
const fixtures=[];
for(let n=0;n<8;n++){
 const home='HOME'+n,away='AWAY'+n,leagueId='LEAGUE'+n;
 const hist=[];
 for(let j=1;j<=70;j++){
   const date='2026-09-'+String(1+(j%28)).padStart(2,'0');
   hist.push({date,home:j%4===0?home:'OTHER',away:j%3===0?away:'OTHER',hs:j%3,as:j%2});
 }
 hist.sort((a,b)=>a.date.localeCompare(b.date));
 const fixture={id:'MATCH'+n,date:'2026-11-03',home,away,league:'League '+n,leagueId};
 const model=m.analyze(fixture,hist);
 fixtures.push(Object.assign({},fixture,{model}));
}
const test=fixtures[0],past=Array.from({length:5},(_,i)=>({
 date:'2026-10-'+String(i+1).padStart(2,'0'),home:'H',away:'A',hs:1,as:1
}));
const late=[...Array.from({length:70},(_,i)=>{
 const date='2026-09-'+String(1+i%28).padStart(2,'0');
 return {date,home:i%4===0?'H':'Y',away:i%3===0?'A':'Z',hs:i%3,as:i%2};
})].sort((a,b)=>a.date.localeCompare(b.date));
const fixture={date:'2026-11-03',home:'H',away:'A'};
const future={date:'2026-11-30',home:'H',away:'Z',hs:14,as:14};
const before=m.analyze(fixture,late);
const after=m.analyze(fixture,late.concat([future]));
const selective=m.createCoupons(fixtures,'selective',2,6);
const balanced=m.createCoupons(fixtures,'balanced',3,6);
const builder=m.createCoupons(fixtures,'builder',2,6);
const results={gridTotal:rows.reduce((s,x)=>s+x.p,0),
 probabilities:m.MARKETS.map(k=>m.marketP(rows,k.id)),
 q:m.quoteThreshold(.5),naive:m.marketP(rows,'btts')*m.marketP(rows,'o25'),
 correlated:m.jointSameGame(rows,['btts','o25']),
 repeated:m.jointSeparate([{match:{id:'x'},p:.5},{match:{id:'x'},p:.6}]),
 distinct:m.jointSeparate([{match:{id:'x'},p:.5},{match:{id:'y'},p:.6}]),
 futureSafe:JSON.stringify(before)===JSON.stringify(after),
 insufficient:m.analyze(fixture,past)===null,
 csv:m.parseCSV('home,away\n"A, Team",B\n')[0]?.home,
 fixtureModels:fixtures.filter(x=>!!x.model).length,
 selective:selective.map(x=>({p:x.p,legs:x.legs.map(y=>y.match.id)})),
 balanced:balanced.map(x=>({p:x.p,legs:x.legs.map(y=>y.match.id)})),
 builder:builder.map(x=>({p:x.p,legs:x.legs.map(y=>y.match.id)}))
};
console.log(JSON.stringify(results));
'''
        p=subprocess.run(["node","-e",program,str(core)],capture_output=True,text=True,check=True)
        cls.d=json.loads(p.stdout)

    def test_grid_probability(self):
        self.assertAlmostEqual(self.d["gridTotal"],1,places=7)
        self.assertTrue(all(0<=p<=1 for p in self.d["probabilities"]))

    def test_correlation_not_naively_multiplied(self):
        self.assertNotAlmostEqual(self.d["correlated"],self.d["naive"],places=3)

    def test_no_duplicate_match_in_multibet(self):
        for group in ("selective","balanced"):
            for ticket in self.d[group]:
                self.assertEqual(len(ticket["legs"]),len(set(ticket["legs"])))

    def test_builder_joint_same_match(self):
        for ticket in self.d["builder"]:
            self.assertEqual(len(set(ticket["legs"])),1)
            self.assertGreater(ticket["p"],0)

    def test_no_future_leakage(self):
        self.assertTrue(self.d["futureSafe"])

    def test_insufficient_sample_blocks_model(self):
        self.assertTrue(self.d["insufficient"])
        self.assertEqual(self.d["fixtureModels"],8)

    def test_bet_math_and_duplicate_detection(self):
        self.assertAlmostEqual(self.d["q"],1/(.88*.5))
        self.assertIsNone(self.d["repeated"])
        self.assertAlmostEqual(self.d["distinct"],.3)

    def test_quoted_csv(self):
        self.assertEqual(self.d["csv"],"A, Team")

    def test_ui_no_remote_api_and_no_auto_betting(self):
        ui=(ROOT/"site/assets/kupony.js").read_text(encoding="utf-8")
        html=(ROOT/"site/kupony.html").read_text(encoding="utf-8")
        self.assertIn("mode:'same-origin'",ui)
        self.assertNotIn("api.telegram.org",ui)
        self.assertNotIn("api.bookmaker",ui)
        self.assertIn("connect-src 'self'",html)
        self.assertIn("./assets/coupon-core.js",html)

if __name__=="__main__":unittest.main()
