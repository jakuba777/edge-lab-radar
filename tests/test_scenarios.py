import json
import pathlib
import subprocess
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]

class ScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        js=ROOT/"site/assets/scenarios.js"
        script=r'''
const a=require(process.argv[1]);
const grid=a.makeGrid(1.45,1.2);
const probs=a.mk.map(x=>({id:x.id,p:a.probability(grid,x.fn)}));
const both=a.sameGameProbability(grid,['o25','btts']);
const p25=probs.find(x=>x.id==='o25').p;
const btts=probs.find(x=>x.id==='btts').p;
const history=[];
for(let i=1;i<=70;i++){
 const date='2026-09-'+String(1+(i%28)).padStart(2,'0');
 history.push({date,home:i%4===0?'A':'C',away:i%3===0?'B':'Z',hs:(i%3)+1,as:i%2});
}
history.sort((a,b)=>a.date.localeCompare(b.date));
const fixture={date:'2026-11-03',home:'A',away:'B'};
const future={date:'2026-12-02',home:'A',away:'B',hs:14,as:0};
const noFuture=a.model(fixture,history);
const sameFuture=a.model(fixture,history.concat([future]));
const fixtureA={date:'2026-11-03',home:'A',away:'B',league:'Test',leagueId:'T'};
const fixtureB={date:'2026-11-04',home:'C',away:'D',league:'Test2',leagueId:'T2'};
const mock=[{id:'a',f:fixtureA,m:noFuture},{id:'b',f:fixtureB,m:noFuture}];
const same=a.scenariosFor(mock,'same2');
console.log(JSON.stringify({
 gridSum:grid.reduce((v,x)=>v+x.p,0),
 both,multiplied:p25*btts,
 invalid:a.crossGameProbability([{matchId:'a',p:.7},{matchId:'a',p:.5}]),
 valid:a.crossGameProbability([{matchId:'a',p:.7},{matchId:'b',p:.5}]),
 quote:a.requiredQuote(.5),model:!!noFuture,stable:JSON.stringify(noFuture)===JSON.stringify(sameFuture),
 csv:a.parseCSV('date,home,away\n2026-10-01,"Club, FC",Other\n')[0]?.home,
 same:same.map(x=>x.legs.map(z=>z.matchId)),
 escaped:a.mk.some(x=>!x.name),
 sameValues:same.map(x=>x.p)
}));
'''
        p=subprocess.run(["node","-e",script,str(js)],capture_output=True,text=True,check=True)
        cls.x=json.loads(p.stdout)

    def test_normalized_joint_distribution(self):
        self.assertAlmostEqual(self.x["gridSum"],1,places=8)
    def test_same_game_correlation_not_naively_multiplied(self):
        self.assertNotAlmostEqual(self.x["both"],self.x["multiplied"],places=3)
    def test_repeated_match_is_rejected(self):
        self.assertIsNone(self.x["invalid"])
    def test_independent_games_only(self):
        self.assertAlmostEqual(self.x["valid"],.35)
    def test_tax_quote_mathematics(self):
        self.assertAlmostEqual(self.x["quote"],1/(.88*.5))
    def test_model_quality_available(self):
        self.assertTrue(self.x["model"])
    def test_future_results_cannot_affect_model(self):
        self.assertTrue(self.x["stable"])
    def test_csv_quoted_names(self):
        self.assertEqual(self.x["csv"],"Club, FC")
    def test_same_game_generated_probabilities_valid(self):
        self.assertTrue(all(0<x<1 for x in self.x["sameValues"]))
    def test_no_private_remote_script(self):
        source=(ROOT/"site/assets/scenarios.js").read_text(encoding="utf-8")
        self.assertNotIn("raw.githubusercontent.com",source)
        self.assertIn("mode:'same-origin'",source)

if __name__=="__main__":unittest.main()
