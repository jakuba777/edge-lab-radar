import json
import pathlib
import subprocess
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]


class RemainingTodayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        program=r"""
const C=require(process.argv[1]);
const W=require(process.argv[2]);
const now=new Date('2026-10-31T18:35:00Z'); // Europe/Warsaw 19:35
const today=(time)=>({date:'2026-10-31',time});
const tomorrow={date:'2026-11-01',time:''};
const history=Array.from({length:60},(_,i)=>({
  date:'2026-10-01',home:'OTHER'+i,away:'OPP'+i,hs:i%3,as:i%2
})).concat(
 Array.from({length:4},(_,i)=>({date:'2026-10-02',home:'Home',away:'H'+i,hs:2,as:1})),
 Array.from({length:4},(_,i)=>({date:'2026-10-02',home:'A'+i,away:'Away',hs:1,as:0}))
);
const fixture={date:'2026-10-31',home:'Home',away:'Away'};
const strict=C.analyze(fixture,history);
const explored=C.analyze(fixture,history,{exploratory:true});
const rejected=C.createCoupons([{
 id:'x',date:'2026-11-01',home:'Home',away:'Away',
 leagueId:'L1',model:explored
}],'single',1,6);
console.log(JSON.stringify({
 clock:W.clock(now),
 good:W.eligible(today('20:45'),now,5),
 started:W.eligible(today('19:00'),now,5),
 cutoff:W.eligible(today('19:45'),now,5),
 unknown:W.eligible(today(''),now,5),
 stale:W.eligible(today('20:45'),now,9),
 tomorrow:W.eligible(tomorrow,now,15),
 yesterday:W.eligible({date:'2026-10-30',time:'23:00'},now,5),
 midnight:W.status(today('23:30'),new Date('2026-10-31T23:05:00Z'),3),
 strictMissing:strict===null,
 exploratory:!!explored&&explored.exploratory===true,
 nH:explored?.nH,nA:explored?.nA,
 couponRejected:rejected.length===0,
 sorted:[tomorrow,today('21:00'),today('20:45')].sort((a,b)=>
  W.sortKey(a).localeCompare(W.sortKey(b))).map(x=>x.date+' '+x.time)
}));
"""
        r=subprocess.run(["node","-e",program,
                          str(ROOT/"site/assets/coupon-core.js"),
                          str(ROOT/"site/assets/time-window.js")],
                         capture_output=True,text=True,check=True)
        cls.result=json.loads(r.stdout)

    def test_warsaw_clock_and_today_cutoff(self):
        x=self.result
        self.assertEqual(x["clock"],{"date":"2026-10-31","minute":19*60+35})
        self.assertTrue(x["good"])
        for name in ("started","cutoff","unknown","stale","yesterday"):
            with self.subTest(name=name):
                self.assertFalse(x[name])
        self.assertTrue(x["tomorrow"])
        self.assertEqual(x["midnight"],"past")
        self.assertEqual(x["sorted"],["2026-10-31 20:45","2026-10-31 21:00","2026-11-01 "])

    def test_low_sample_research_never_goes_into_realistic_coupons(self):
        x=self.result
        self.assertTrue(x["strictMissing"])
        self.assertTrue(x["exploratory"])
        self.assertEqual((x["nH"],x["nA"]),(4,4))
        self.assertTrue(x["couponRejected"])

    def test_mobile_ui_and_main_radar_have_shared_guard(self):
        for page in ("kupony.html","index.html","rynek.html"):
            html=(ROOT/"site"/page).read_text(encoding="utf-8")
            self.assertIn("time-window.js",html)
        ui=(ROOT/"site/assets/kupony.js").read_text(encoding="utf-8")
        self.assertIn("renderTodayExplorer",ui)
        self.assertIn("W.eligible(m,new Date(),sourceAge())",ui)
        self.assertIn("W.status(m,new Date(),sourceAge())",ui)
        self.assertIn("exploratory:true",ui)
        self.assertIn("data-evening-copy",ui)
        self.assertNotIn("localStorage.setItem",ui)
        for js in ("time-window.js","kupony.js","coupon-core.js","market.js","app.js"):
            result=subprocess.run(["node","--check",str(ROOT/"site/assets"/js)],
                                  capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)


if __name__=="__main__":
    unittest.main()
