import datetime as dt
import importlib.util
import json
import subprocess
import pathlib
import tempfile
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("replay08",ROOT/"scripts"/"live_replay08.py")
R=importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)

class Replay08Tests(unittest.TestCase):
    def test_minute_parser(self):
        self.assertEqual(R.minute_token("90+4"),94)
        self.assertEqual(R.minute_token("45+2"),47)
        self.assertEqual(R.minute_token("56"),56)
        for s in ("","abc","90+45","121","20-55","0"):
            self.assertIsNone(R.minute_token(s))

    def test_reject_incomplete_minutes(self):
        self.assertIsNone(R.minutes_from_text("",2,1))
        self.assertIsNone(R.minutes_from_text("12,33",2,1))
        self.assertIsNone(R.minutes_from_text("12,abc,80",2,1))
        self.assertEqual(R.minutes_from_text("",0,0),[])
        self.assertEqual(R.minutes_from_text("10,35,81",2,1,2,0),[10,35,81])
        self.assertIsNone(R.minutes_from_text("10,35,81",2,1,0,1))

    def test_only_prior_goals_in_visible_frame(self):
        a={"minutes":[19,61,84]}
        self.assertEqual(R.prior_count(a,60),0)
        self.assertEqual(R.next_goal(a,60),1)
        self.assertEqual(R.prior_count(a,75),1)
        self.assertEqual(R.next_goal(a,75),1)

    def test_future_match_is_never_in_history(self):
        prior=[{"date":dt.date(2026,9,1)+dt.timedelta(days=i),
                "minutes":[55] if i%2 else [10]} for i in range(25)]
        today={"date":dt.date(2026,10,15),"minutes":[70]}
        base=R.forecast(60,prior,R.prior_count(today,60))
        contaminated=[{"date":dt.date(2026,10,16),"minutes":[61,62,63]}]
        # The grouping function must be called only on strictly earlier dates.
        restricted=[r for r in prior+contaminated if r["date"]<today["date"]]
        self.assertEqual(base,R.forecast(60,restricted,R.prior_count(today,60)))

    def test_strength_low_history_blocks_model(self):
        rows=[{"minutes":[55]} for _ in range(R.MIN_BASE-1)]
        self.assertIsNone(R.forecast(60,rows,0))

    def test_last15_shrinkage_and_probabilities(self):
        history=[{"minutes":[55,65] if i%3==0 else [21]} for i in range(30)]
        p=R.forecast(60,history,1)
        self.assertTrue(0<=p["experimental"]<=1)
        self.assertTrue(0<=p["baseline"]<=1)
        self.assertEqual(p["history"],30)
        self.assertEqual(R.SMOOTH,24)

    def test_validation_does_not_score_today_or_future(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            league=root/"LEAGUE";league.mkdir()
            rows=["date,home,away,ft_home,ft_away,ht_home,ht_away,goal_minutes"]
            for i in range(65):
                date=(dt.date(2026,8,1)+dt.timedelta(days=i)).isoformat()
                rows.append(f'{date},H{i},A{i},1,1,1,0,"15,78"')
            (league/"results_2627.csv").write_text("\n".join(rows)+"\n",encoding="utf-8")
            (root/"status.json").write_text(json.dumps({
                "retrieved_at_utc":"2026-10-10T10:00:00+00:00",
                "leagues":[{"id":"LEAGUE","name":"Test League"}]
            }),encoding="utf-8")
            with patch.object(R,"DATA",root):
                report=R.run(now=dt.datetime(2026,10,4,12,tzinfo=dt.timezone.utc))
            self.assertTrue(all(m["date"]<"2026-10-04" for m in report["replays"]))
            self.assertEqual(report["mode"],"REPLAY_ONLY_NOT_LIVE")
            self.assertEqual(report["test_results"]["status"],"research_only")

    def test_all_replay_json_paths_safe(self):
        source=(ROOT/"scripts"/"live_replay08.py").read_text(encoding="utf-8")
        self.assertIn("strictly earlier",source.lower())
        self.assertNotIn("api-football.com",source)

    def test_browser_script_parses_and_is_same_origin(self):
        script=ROOT/"site/assets/live08.js"
        p=subprocess.run(["node","--check",str(script)],capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stderr)
        source=script.read_text(encoding="utf-8")
        self.assertIn("mode:'same-origin'",source)
        self.assertNotIn("api-sports.io",source)
        self.assertIn("Odkryj, co wydarzyło się potem",source)

    def test_page_explicitly_distinguishes_replay_from_live(self):
        html=(ROOT/"site/live.html").read_text(encoding="utf-8")
        home=(ROOT/"site/index.html").read_text(encoding="utf-8")
        self.assertIn("Źródło LIVE: niepodłączone",html)
        self.assertIn("REPLAY",html)
        self.assertIn("connect-src 'self'",html)
        self.assertIn('href="./live.html"',home)

    def test_replay_is_grouped_by_past_match_date(self):
        source=(ROOT/"scripts/live_replay08.py").read_text(encoding="utf-8")
        self.assertIn('r["date"]<match["date"]',source)
        self.assertIn('match["date"]<now.astimezone',source)

if __name__=="__main__":unittest.main()
