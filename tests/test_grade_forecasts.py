import datetime as dt
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("grade_forecasts",ROOT/"scripts"/"grade_forecasts.py")
G=importlib.util.module_from_spec(spec)
spec.loader.exec_module(G)

class GradeTests(unittest.TestCase):
    def setUp(self):
        self.today=dt.date(2026,10,29)
        self.key=("Premier League","2026-10-28","H","A")
        self.score={self.key:(2,1,0,1)}

    def test_pre_match_only_and_source_time(self):
        meta={"id":123,"created_at":"2026-10-27T21:20:00Z"}
        body={"schema":1,"status":"ready","created_utc":"2026-10-27T20:40:00+00:00",
              "source_retrieved_at_utc":"2026-10-27T20:39:00Z"}
        self.assertTrue(G.prior_snapshot(meta,body,"2026-10-28"))
        self.assertFalse(G.prior_snapshot(meta,body,"2026-10-27"))
        after=dict(body,created_utc="2026-10-28T04:30:00Z")
        self.assertFalse(G.prior_snapshot(meta,after,"2026-10-28"))
        unreliable=dict(body,source_retrieved_at_utc="2026-10-28T01:00:00Z")
        self.assertFalse(G.prior_snapshot(meta,unreliable,"2026-10-28"))

    def test_cannot_settle_today_or_missing_result(self):
        first=G.assess_event(self.key,"o25",.75,self.score,dt.date(2026,10,28))
        self.assertEqual(first["state"],"pending")
        second=G.assess_event(self.key,"o25",.75,{},self.today)
        self.assertEqual(second["state"],"pending")

    def test_true_hit_and_false_miss(self):
        win=G.assess_event(self.key,"o25",.75,self.score,self.today)
        miss=G.assess_event(self.key,"u35",.75,{self.key:(5,0,2,0)},self.today)
        self.assertEqual(win["state"],"hit")
        self.assertEqual(miss["state"],"miss")

    def test_score_market_logic(self):
        s=(2,1,0,1)
        self.assertEqual(G.actual_score(s,"btts"),1)
        self.assertEqual(G.actual_score(s,"oneX"),1)
        self.assertEqual(G.actual_score(s,"ag"),1)
        self.assertEqual(G.actual_score(s,"2/1"),1)
        self.assertEqual(G.actual_score(s,"1/2"),0)
        self.assertIsNone(G.actual_score((2,1,None,None),"2/1"))
        self.assertEqual(G.actual_score((2,1,None,None),"o25"),1)

    def test_first_forecast_only(self):
        sample=[
            {"key":self.key,"created_utc":"2026-10-27T23:00:00Z","artifact_id":98,"p":.8},
            {"key":self.key,"created_utc":"2026-10-27T19:00:00Z","artifact_id":4,"p":.65},
            {"key":self.key,"created_utc":"2026-10-27T20:00:00Z","artifact_id":8,"p":.71}
        ]
        first=G.earliest_per_key(sample,lambda x:x["key"])
        self.assertEqual(len(first),1)
        self.assertEqual(first[0]["p"],.65)

    def test_coupon_whole_entry_and_pending(self):
        match2=("Premier League","2026-10-30","C","D")
        combo={"id":"a"*24,"profile":"balanced","type":"separate","created_utc":"2026-10-27T12:00:00Z",
            "p":.45,"legs":[{"key":self.key,"market":"o15","p":.8},
                             {"key":match2,"market":"btts","p":.6}]}
        grading=G.grade([],[],[combo],self.score,self.today)
        self.assertEqual(grading["summary"]["simulated_coupons"]["pending"],1)
        grading=G.grade([],[],[combo],{**self.score,match2:(0,0,0,0)},dt.date(2026,10,31))
        self.assertEqual(grading["summary"]["simulated_coupons"]["miss"],1)
        grading=G.grade([],[],[combo],{**self.score,match2:(1,1,0,0)},dt.date(2026,10,31))
        self.assertEqual(grading["summary"]["simulated_coupons"]["hit"],1)

    def test_forecast_snapshot_archive_parse(self):
        meta={"id":111,"created_at":"2026-10-27T20:00:00Z"}
        body={"schema":1,"status":"ready","created_utc":"2026-10-27T19:00:00Z",
            "source_retrieved_at_utc":"2026-10-27T18:50:00Z",
            "candidates":[{"league":"Premier League","fixture_date":"2026-10-28","home":"H","away":"A",
               "chosen_market":"o25","predicted_probability":.68,
               "goal_markets":{"o15":.8,"o25":.68,"u35":.81,"btts":.52}}]}
        parsed=G.read_historical_forecasts(meta,body)
        self.assertEqual(len(parsed),1)
        self.assertEqual(parsed[0]["key"],self.key)
        body["candidates"][0]["fixture_date"]="2026-10-27"
        self.assertEqual(G.read_historical_forecasts(meta,body),[])

    def test_scores_from_csv_and_conflicting_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            (root/"status.json").write_text(json.dumps({"leagues":[{"id":"E0","name":"Premier League"}]}),encoding="utf-8")
            league=root/"E0";league.mkdir()
            file=league/"results_2627.csv"
            cols="date,home,away,ft_home,ft_away,ht_home,ht_away\n"
            file.write_text(cols+"2026-10-28,H,A,2,1,0,1\n",encoding="utf-8")
            with patch.object(G,"DATA",root):
                scores,conflicts=G.load_scores()
                self.assertEqual(scores[self.key],(2,1,0,1))
                self.assertEqual(conflicts,0)
                file.write_text(cols+"2026-10-28,H,A,2,1,0,1\n2026-10-28,H,A,1,2,0,0\n",encoding="utf-8")
                scores,conflicts=G.load_scores()
                self.assertNotIn(self.key,scores)
                self.assertEqual(conflicts,1)

    def test_coupon_snapshot_js_syntax(self):
        script=ROOT/"scripts"/"snapshot_coupons.js"
        p=subprocess.run(["node","--check",str(script)],text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stderr)

    def test_workflow_reads_actions_with_scoped_token(self):
        workflow=(ROOT/".github/workflows/pages.yml").read_text(encoding="utf-8")
        self.assertIn("actions: read",workflow)
        self.assertIn("GH_TOKEN:",workflow)
        self.assertIn("python scripts/grade_forecasts.py",workflow)
        self.assertIn("node scripts/snapshot_coupons.js",workflow)
        self.assertIn("retention-days: 45",workflow)

if __name__=="__main__":unittest.main()
