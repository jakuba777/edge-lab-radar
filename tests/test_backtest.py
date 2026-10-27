import datetime as dt
import importlib.util
import pathlib
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("audit",ROOT/"scripts"/"backtest.py")
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

class AuditTests(unittest.TestCase):
    def setUp(self):
        self.rows=[]
        for i in range(1,8):
            d=dt.date(2025,9,i)
            self.rows += [
                {"date":d,"home":"HOME","away":"OTHER","hs":2,"as":1},
                {"date":d,"home":"OTHER","away":"AWAY","hs":1,"as":1},
            ]
        self.fixture={"date":dt.date(2025,9,15),"home":"HOME","away":"AWAY","hs":2,"as":1}
    def test_model_has_past_only(self):
        a=audit.model(self.fixture,self.rows)
        self.assertIsNotNone(a)
        b=audit.model(self.fixture,self.rows+[{"date":dt.date(2025,9,20),"home":"HOME","away":"OTHER","hs":13,"as":0}])
        self.assertNotEqual(a,b)  # model requires caller to filter the data
        base=audit.evaluate(self.rows+[self.fixture])
        future=audit.evaluate(self.rows+[self.fixture,{"date":dt.date(2025,9,20),"home":"HOME","away":"OTHER","hs":13,"as":0}])
        self.assertGreater(base["markets"]["o25"]["n"],0)
        # Last fixture should have same prediction regardless of extra future records.
        prior_base=[x for x in self.rows+[self.fixture] if x["date"]<self.fixture["date"]]
        prior_future=[x for x in self.rows+[self.fixture,{"date":dt.date(2025,9,20),"home":"HOME","away":"OTHER","hs":13,"as":0}] if x["date"]<self.fixture["date"]]
        self.assertEqual(audit.model(self.fixture,prior_base),audit.model(self.fixture,prior_future))
    def test_avoid_same_day_leakage(self):
        before=[r for r in self.rows if r["date"]<self.fixture["date"]]
        same_day={"date":self.fixture["date"],"home":"HOME","away":"OTHER","hs":13,"as":0}
        self.assertEqual(audit.model(self.fixture,before),audit.model(self.fixture,[r for r in self.rows+[same_day] if r["date"]<self.fixture["date"]]))
    def test_probability_range(self):
        m=audit.model(self.fixture,self.rows)
        self.assertTrue(all(0<=v<=1 for v in m.values()))
    def test_metrics(self):
        d=audit.metrics([{"p":0.8,"y":1,"base":0.5},{"p":0.2,"y":0,"base":0.5}])
        self.assertAlmostEqual(d["brier"],0.04)
        self.assertGreater(d["baseline_brier"],d["brier"])
    def test_calibration_bins(self):
        b=audit.calibration([{"p":0.8,"y":1,"base":0.5}])
        self.assertEqual(sum(x["n"] for x in b),1)

if __name__=="__main__":
    unittest.main()
