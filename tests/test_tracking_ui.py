import pathlib
import subprocess
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]

class TrackingUITests(unittest.TestCase):
    def test_mobile_dashboard_script_valid(self):
        js=ROOT/"site/assets/track.js"
        result=subprocess.run(["node","--check",str(js)],text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_dashboard_required_elements(self):
        html=(ROOT/"site/skutecznosc.html").read_text(encoding="utf-8")
        js=(ROOT/"site/assets/track.js").read_text(encoding="utf-8")
        for id in ("track-main-metrics","track-coupons-metrics","track-market",
                   "track-halftime","track-history","track-kind","track-filter"):
            self.assertIn('id="'+id+'"',html)
            self.assertIn("'"+id+"'",js)
        self.assertIn("connect-src 'self'",html)
        self.assertIn("track_record.json",js)
        self.assertIn("WESZŁO",js)
        self.assertIn("NIE WESZŁO",js)
        self.assertIn("OCZEKUJE",js)

    def test_navigation_to_tracking(self):
        for name in ("index.html","kupony.html","lamaki.html"):
            page=(ROOT/"site"/name).read_text(encoding="utf-8")
            self.assertIn('href="./skutecznosc.html"',page)

if __name__=="__main__":unittest.main()
