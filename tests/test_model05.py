import datetime as dt
import math
import pathlib
import sys
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import model05
import backtest

class Model05Tests(unittest.TestCase):
    def setUp(self):
        self.rows=[]
        for day in range(1,14):
            d=dt.date(2025,9,day)
            self.rows.extend([
                {"date":d,"home":"HOME","away":"OTHER","hs":day%3,"as":day%2},
                {"date":d,"home":"OTHER","away":"AWAY","hs":day%2,"as":day%3},
                {"date":d,"home":"SIDE","away":"OTHER","hs":2,"as":0},
            ])
        self.game={"date":dt.date(2025,9,24),"home":"HOME","away":"AWAY",
                   "hs":1,"as":1}

    def test_legacy_rate_matches_current_shipped_model(self):
        old=model05.rates(self.game,self.rows)
        expected=backtest.model(self.game,self.rows)
        actual=model05.market_probs(old,0)
        for k in backtest.MARKETS:
            self.assertAlmostEqual(actual[k],expected[k],places=8)

    def test_future_and_same_day_leakage_blocked(self):
        altered=self.rows+[
            {"date":self.game["date"],"home":"HOME","away":"OTHER","hs":12,"as":14},
            {"date":dt.date(2025,10,3),"home":"OTHER","away":"AWAY","hs":14,"as":14}
        ]
        for half_life in (None,75,120,180):
            self.assertEqual(model05.rates(self.game,self.rows,half_life),
                             model05.rates(self.game,altered,half_life))

    def test_correction_exactly_one_at_zero_rho(self):
        for h in range(3):
            for a in range(3):
                self.assertEqual(model05.dc_tau(h,a,1.7,1.3,0),1)
        self.assertEqual(model05.market_probs((1.7,1.3),0),
                         backtest.markets_from_rates(1.7,1.3))

    def test_dc_is_valid_probability(self):
        for rho in model05.RHOS:
            for pair in ((.25,.25),(1.7,1.3),(3.7,3.7)):
                m=model05.market_probs(pair,rho)
                self.assertTrue(all(0<=v<=1 for v in m.values()))
                self.assertTrue(all(model05.dc_tau(h,a,*pair,rho)>0
                            for h,a in ((0,0),(0,1),(1,0),(1,1))))

    def test_dc_only_modifies_low_score_events_with_fixed_rates(self):
        p=model05.market_probs((1.4,1.1),0)
        a=model05.market_probs((1.4,1.1),-.12)
        self.assertNotAlmostEqual(a["btts"],p["btts"],places=6)
        self.assertNotAlmostEqual(a["o15"],p["o15"],places=6)
        for k in ("o25","u35","hg","ag"):
            self.assertAlmostEqual(a[k],p[k],places=8)

    def test_metrics_improvement_sign(self):
        x=model05.metrics([
            {"y":1,"old":.5,"new":.8,"baseline":.4},
            {"y":0,"old":.5,"new":.2,"baseline":.4}])
        self.assertEqual(x["n"],2)
        self.assertTrue(x["improved"])
        self.assertAlmostEqual(x["new_brier"],.04)
        self.assertLess(x["delta_new_minus_old"],0)

    def test_holdout_separate_by_season_in_runner(self):
        s=(ROOT/"scripts"/"model05.py").read_text(encoding="utf-8")
        self.assertIn('training=[rows for label,rows in datasets["2425"]',s)
        self.assertIn('holdout=[(label,rows) for label,rows in datasets["2526"]',s)

if __name__=="__main__":unittest.main()
