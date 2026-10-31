"""Offline tests: no provider credentials or network access required."""
import datetime as dt
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import market_feed as m


class MarketFeedTests(unittest.TestCase):
    def test_no_credentials_is_safe(self):
        result = m.generate(environment={}, now=dt.datetime(2026, 10, 31, tzinfo=dt.timezone.utc))
        self.assertEqual(result["api_football"]["status"], "not_configured")
        self.assertEqual(result["superbet_pl_odds"]["status"], "not_configured")
        self.assertFalse(result["raw_odds_published"])
        self.assertFalse(result["private_account_connected"])
        self.assertFalse(result["data_live_on_site"])

    def test_validates_tournament_ids(self):
        self.assertEqual(m.validate_tournaments("17, 8"), [17, 8])
        for bad in ("1,2,3,4", "1,evil", "1,,3", "-3", "0", "1&apiKey=oops"):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    m.validate_tournaments(bad)

    def test_sports_and_odds_summary(self):
        f = {"response": [
            {"fixture": {"status": {"short": "1H"}}},
            {"fixture": {"status": {"short": "2H"}}},
            {"fixture": {"status": {"short": "NS"}}},
        ], "errors": []}
        o = [
            {"fixtureId": "one", "bookmakerOdds": {"superbet.pl": {
                "bookmakerIsActive": True, "suspended": False, "markets": {"a": {"outcomes": {}}}
            }}},
            {"fixtureId": "two", "bookmakerOdds": {"superbet.pl": {
                "bookmakerIsActive": True, "suspended": True, "markets": {"b": {}}
            }}},
        ]
        self.assertEqual(m.summarize_football(f)["recognized_live_events"], 2)
        self.assertEqual(m.summarize_odds(o), {"provider_fixtures": 2, "fixtures_with_active_market": 1})

    def test_only_aggregates_and_never_publishes_keys_or_raw_odds(self):
        secret1, secret2 = "sensitive-football-key", "sensitive-odds-key"
        urls = []
        def fake(url, headers=None):
            urls.append(url)
            if "oddspapi" in url:
                return [{"fixtureId": "id123", "bookmakerOdds": {"superbet.pl": {
                    "bookmakerIsActive": True, "markets": {"123": {"outcomes": {
                        "12": {"players": {"0": {"price": 2.19}}}}}
                    }}}}]
            self.assertEqual(headers["x-apisports-key"], secret1)
            return {"response": [{"fixture": {"status": {"short": "1H"}}}], "errors": []}
        result = m.generate(
            environment={"API_FOOTBALL_KEY": secret1, "ODDSPAPI_KEY": secret2,
                         "ODDSPAPI_TOURNAMENT_IDS": "17,8"},
            get_json=fake
        )
        raw = json.dumps(result)
        self.assertNotIn(secret1, raw)
        self.assertNotIn(secret2, raw)
        self.assertNotIn("2.19", raw)
        self.assertEqual(result["api_football"]["status"], "connected")
        self.assertEqual(result["superbet_pl_odds"]["status"], "connected")
        self.assertEqual(len(urls), 2)

    def test_provider_failure_does_not_leak_url(self):
        def broken(url, headers=None):
            raise ValueError("secret-url-token")
        report = m.generate(environment={"ODDSPAPI_KEY": "secret", "ODDSPAPI_TOURNAMENT_IDS": "17"},
                            get_json=broken)
        self.assertEqual(report["superbet_pl_odds"]["status"], "error")
        self.assertNotIn("secret", json.dumps(report))
        self.assertEqual(report["superbet_pl_odds"]["reason"], "invalid_provider_response")


if __name__ == "__main__":
    unittest.main()
