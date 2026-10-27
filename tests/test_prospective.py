import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import prospective

class ProspectiveTests(unittest.TestCase):
    def test_only_future_fixture_and_past_scores(self):
        base=dt.date(2026,10,27)
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            league=root/"TEST_1_league"
            league.mkdir()
            (root/"status.json").write_text(json.dumps({
                "retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
                "leagues":[{"id":"TEST_1_league","name":"Test League"}]
            }),encoding="utf-8")
            old="date,home,away,ft_home,ft_away\n"
            for i in range(1,6):
                old+=f"2026-10-{i:02d},HOME,OTHER,2,0\n"
                old+=f"2026-10-{i:02d},OTHER,AWAY,1,1\n"
            future=old+"2026-11-02,HOME,OTHER,14,0\n"
            fixtures="date,home,away,time\n2026-10-27,HOME,AWAY,14:00\n2026-10-28,HOME,AWAY,20:00\n"
            (league/"results_2627.csv").write_text(old,encoding="utf-8")
            (league/"fixtures_2627.csv").write_text(fixtures,encoding="utf-8")
            with patch.object(prospective,"DATA",root):
                first=prospective.generate(today=base)
                (league/"results_2627.csv").write_text(future,encoding="utf-8")
                second=prospective.generate(today=base)
            self.assertEqual(first["status"],"ready")
            self.assertEqual(first["upcoming"],1)
            self.assertEqual(first["eligible"],1)
            self.assertEqual(len(first["candidates"]),1)
            self.assertEqual(first["candidates"],second["candidates"])
            self.assertEqual(first["candidates"][0]["fixture_date"],"2026-10-28")

    def test_old_source_blocks_forecasts(self):
        base=dt.date(2026,10,27)
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp)
            (root/"status.json").write_text(json.dumps({
                "retrieved_at_utc":"2025-01-01T00:00:00+00:00","leagues":[]}),encoding="utf-8")
            with patch.object(prospective,"DATA",root):
                res=prospective.generate(today=base)
            self.assertEqual(res["status"],"stale_source")
            self.assertEqual(res["candidates"],[])

if __name__=="__main__":unittest.main()
