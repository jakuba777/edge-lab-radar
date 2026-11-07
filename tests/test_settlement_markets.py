"""Regression: every market emitted by Coupon Core must be settled by grader."""
import importlib.util
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("grade_forecasts", ROOT / "scripts" / "grade_forecasts.py")
grader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(grader)

class SettlementMarketsTest(unittest.TestCase):
    def test_all_coupon_core_markets_supported(self):
        source = (ROOT / "site" / "assets" / "coupon-core.js").read_text(encoding="utf-8")
        ids = set(re.findall(r"\{id:'([^']+)',label:", source))
        self.assertEqual(ids, grader.COUPON_MARKETS)
        for market in ids:
            self.assertIn(grader.actual_score((2, 1, 1, 0), market), (0, 1))

    def test_added_markets(self):
        self.assertEqual(grader.actual_score((2, 1, 1, 0), "o35"), 0)
        self.assertEqual(grader.actual_score((2, 2, 1, 1), "o35"), 1)
        self.assertEqual(grader.actual_score((1, 0, 1, 0), "u25"), 1)
        self.assertEqual(grader.actual_score((2, 1, 1, 0), "u25"), 0)
        self.assertEqual(grader.actual_score((1, 0, 1, 0), "bttsNo"), 1)
        self.assertEqual(grader.actual_score((1, 1, 0, 1), "bttsNo"), 0)
        self.assertEqual(grader.actual_score((1, 1, 0, 1), "x"), 1)
        self.assertEqual(grader.actual_score((1, 2, 0, 1), "x"), 0)

if __name__ == "__main__":
    unittest.main()
