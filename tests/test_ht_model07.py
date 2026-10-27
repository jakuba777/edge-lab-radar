import datetime as dt
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import ht_model07 as H

class HalfTimeModelTests(unittest.TestCase):
    def synthetic(self):
        rows=[]
        for i in range(70):
            day=dt.date(2026,8,1)+dt.timedelta(days=i//4)
            rows.append({
                "date":day,
                "home":"HOME" if i%4==0 else "OTHER",
                "away":"AWAY" if i%4==1 else "OTHERAWAY",
                "h1":i%3,"a1":i%2,"h2":(i+1)%3,"a2":(i+1)%2,
                "hf":(i%3)+((i+1)%3),"af":(i%2)+((i+1)%2)
            })
        return rows

    def test_correct_ht_ft_labels(self):
        match={"h1":0,"a1":1,"h2":2,"a2":0}
        self.assertEqual(H.event(match,"2/1"),1)
        self.assertEqual(H.event(match,"1/2"),0)
        inverse={"h1":1,"a1":0,"h2":0,"a2":2}
        self.assertEqual(H.event(inverse,"1/2"),1)
        self.assertEqual(H.event(inverse,"2/1"),0)
        draw={"h1":1,"a1":1,"h2":2,"a2":0}
        self.assertEqual(H.event(draw,"1/2"),0)
        self.assertEqual(H.event(draw,"2/1"),0)

    def test_outcomes_are_mutually_exclusive_and_bounded(self):
        for rates in ((.3,.7,.6,1.2),(.9,.8,1.4,1.1),(2.7,2.7,2.7,2.7)):
            probs=H.comeback_probs(rates)
            self.assertTrue(all(0<=x<=1 for x in probs.values()))
            self.assertLess(probs["2/1"]+probs["1/2"],1)

    def test_identical_teams_symmetric(self):
        p=H.comeback_probs((.7,.7,1.1,1.1))
        self.assertAlmostEqual(p["2/1"],p["1/2"],places=9)

    def test_future_and_same_day_never_leak(self):
        history=self.synthetic()
        game={"date":dt.date(2026,10,10),"home":"HOME","away":"AWAY"}
        old=H.rate_model(game,history)
        self.assertIsNotNone(old)
        contamination={"date":game["date"],"home":"HOME","away":"AWAY",
            "h1":0,"a1":12,"h2":14,"a2":0,"hf":14,"af":12}
        future={**contamination,"date":dt.date(2026,11,10)}
        new=H.rate_model(game,history+[contamination,future])
        self.assertEqual(old,new)

    def test_low_sample_ignores_comebacks(self):
        match={"date":dt.date(2026,10,10),"home":"HOME","away":"AWAY"}
        self.assertIsNone(H.rate_model(match,self.synthetic()[:5]))

    def test_baseline_uses_only_prior_events(self):
        prior=[{"h1":0,"a1":1,"h2":2,"a2":0},
               {"h1":1,"a1":0,"h2":0,"a2":0}]
        self.assertAlmostEqual(H.rolling_frequency(prior,"2/1"),2/42)
        self.assertAlmostEqual(H.rolling_frequency(prior,"1/2"),1/42)

    def test_metrics_direction(self):
        r=H.measure([(.1,.2,0),(.9,.2,1)])
        self.assertLess(r["brier_model"],r["brier_baseline"])
        self.assertEqual(r["events"],1)

    def test_missing_ht_values_not_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=pathlib.Path(tmp)/"r.csv"
            p.write_text("date,home,away,ht_home,ht_away,ft_home,ft_away\n"
                  "2026-08-20,H,A,,,2,1\n"
                  "2026-08-21,H,A,0,1,2,1\n"
                  "2026-08-22,H,A,2,0,1,2\n",encoding="utf-8")
            x=H.read_results(p)
            self.assertEqual(len(x),1)
            self.assertEqual(x[0]["h2"],2)

    def test_technical_split_is_locked(self):
        self.assertEqual(H.TEST_START.isoformat(),"2026-10-01")
        self.assertEqual(H.RARE_PRIOR_MATCHES,40)
        self.assertGreater(H.MIN_LEAGUE,0)

    def test_no_unlicensed_archive_request(self):
        text=(ROOT/"scripts"/"ht_model07.py").read_text(encoding="utf-8")
        self.assertNotIn("football-data.co.uk/mmz4281",text)
        self.assertNotIn("urllib.request",text)

    def test_web_ui_script_parses(self):
        script=ROOT/"site/assets/lamaki07.js"
        result=subprocess.run(["node","--check",str(script)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_web_ui_has_required_readout_fields(self):
        html=(ROOT/"site/lamaki.html").read_text(encoding="utf-8")
        js=(ROOT/"site/assets/lamaki07.js").read_text(encoding="utf-8")
        for marker_id in ("ht07-state","ht07-count","ht07-events","ht07-scores",
                          "ht07-kind","ht07-candidates","ht07-error"):
            self.assertIn('id="'+marker_id+'"',html)
            self.assertIn(marker_id,js)
        self.assertIn("./assets/lamaki07.js",html)
        self.assertIn("connect-src 'self'",html)

if __name__=="__main__":unittest.main()
