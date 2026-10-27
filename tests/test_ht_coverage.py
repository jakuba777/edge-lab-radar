import pathlib
import sys
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from ht_coverage import inspect_rows, parse_score

class HTCoverageTests(unittest.TestCase):
    def test_missing_ht_is_not_zero(self):
        rows=[{"home":"H","away":"A","ft_home":"2","ft_away":"1","ht_home":"","ht_away":""}
             for _ in range(50)]
        x=inspect_rows(rows)
        self.assertEqual(x["matches_with_results"],50)
        self.assertEqual(x["matches_with_valid_htft"],0)
        self.assertFalse(x["usable_for_research"])
        self.assertIsNone(x["reversal_total"])
    def test_both_reversal_directions(self):
        rows=[]
        for i in range(60):
            r={"home":"H","away":"A","ft_home":"2","ft_away":"1","ht_home":"0","ht_away":"1"}
            if i==1:r={"home":"H","away":"A","ft_home":"1","ft_away":"2","ht_home":"1","ht_away":"0"}
            rows.append(r)
        x=inspect_rows(rows)
        self.assertTrue(x["usable_for_research"])
        self.assertEqual(x["reversal_2_1"],59)
        self.assertEqual(x["reversal_1_2"],1)
    def test_invalid_half_cannot_exceed_final(self):
        rows=[{"home":"H","away":"A","ft_home":"1","ft_away":"1","ht_home":"2","ht_away":"0"} for _ in range(50)]
        self.assertEqual(inspect_rows(rows)["matches_with_valid_htft"],0)
    def test_score_sanitization(self):
        for v in ("","NA","-2","100",None):
            self.assertIsNone(parse_score(v))
        self.assertEqual(parse_score("0"),0)

if __name__=="__main__":unittest.main()
