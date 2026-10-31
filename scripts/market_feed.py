#!/usr/bin/env python3
"""Optional, read-only API connectivity audit for EDGE LAB.

Publishes aggregate diagnostics only. No raw odds, fixtures, credentials or account
data are republished: provider publication rights must be verified separately.
No bookmaker login, scraping, betting, or automatic wagering.
"""
import datetime as dt
import json
import os
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "data" / "market_feed.json"
ODDS_HOST = "https://api.oddspapi.io/v4/odds-by-tournaments"
FOOTBALL_HOST = "https://v3.football.api-sports.io/fixtures"
MAX_BYTES = 2_000_000


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_json(url, headers=None):
    """Read only explicitly constructed HTTPS vendor endpoints; no redirects."""
    req = urllib.request.Request(
        url, headers={"User-Agent": "EDGE-LAB-Research/1.0", **(headers or {})}
    )
    opener = urllib.request.build_opener(NoRedirect)
    with opener.open(req, timeout=15) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("response_too_large")
    return json.loads(data)


def validate_tournaments(value):
    """At most three provider IDs per request; never use raw user input in a URL."""
    value = (value or "").strip()
    if not value:
        return []
    items = value.split(",")
    if not 1 <= len(items) <= 3 or any(not re.fullmatch(r"[1-9][0-9]{0,7}", x.strip()) for x in items):
        raise ValueError("invalid_tournament_ids")
    return [int(x.strip()) for x in items]


def summarize_football(body):
    if not isinstance(body, dict) or body.get("errors") or not isinstance(body.get("response"), list):
        raise ValueError("invalid_football_response")
    rows = body["response"]
    valid = 0
    for row in rows:
        f = row.get("fixture", {}) if isinstance(row, dict) else {}
        status = f.get("status", {}) if isinstance(f, dict) else {}
        if isinstance(status, dict) and status.get("short") in ("1H", "HT", "2H", "ET", "BT", "P", "LIVE"):
            valid += 1
    return {"reported_events": len(rows), "recognized_live_events": valid}


def summarize_odds(body):
    # API may respond as an array, an object with data, or one fixture object.
    if isinstance(body, list):
        rows = body
    elif isinstance(body, dict) and isinstance(body.get("data"), list):
        rows = body["data"]
    elif isinstance(body, dict) and "fixtureId" in body:
        rows = [body]
    else:
        raise ValueError("invalid_odds_response")
    total = 0
    with_odds = 0
    for row in rows:
        if not isinstance(row, dict) or not row.get("fixtureId"):
            continue
        total += 1
        book = (row.get("bookmakerOdds") or {}).get("superbet.pl")
        if isinstance(book, dict) and book.get("bookmakerIsActive") and not book.get("suspended") and book.get("markets"):
            with_odds += 1
    return {"provider_fixtures": total, "fixtures_with_active_market": with_odds}


def safe_failure(exc):
    """Do not expose URLs, API tokens or raw third-party error payloads."""
    if isinstance(exc, urllib.error.HTTPError):
        return "http_" + str(exc.code)
    if isinstance(exc, urllib.error.URLError):
        return "network_error"
    if isinstance(exc, TimeoutError):
        return "timeout"
    if isinstance(exc, (ValueError, KeyError, TypeError, json.JSONDecodeError)):
        return "invalid_provider_response"
    return "request_failed"


def generate(now=None, environment=None, get_json=read_json):
    now = now or dt.datetime.now(dt.timezone.utc)
    env = environment if environment is not None else os.environ
    report = {
        "schema": 1,
        "generated_utc": now.astimezone(dt.timezone.utc).isoformat(timespec="seconds"),
        "mode": "read_only_connectivity_audit",
        "raw_odds_published": False,
        "private_account_connected": False,
        "data_live_on_site": False,
        "api_football": {"status": "not_configured"},
        "superbet_pl_odds": {"status": "not_configured"},
        "notice": "Public page shows connection diagnostics only. No live prices or events are published."
    }
    football_key = (env.get("API_FOOTBALL_KEY") or "").strip()
    if football_key:
        try:
            body = get_json(FOOTBALL_HOST + "?live=all&timezone=Europe%2FWarsaw",
                            {"x-apisports-key": football_key})
            report["api_football"] = {"status": "connected", **summarize_football(body)}
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError) as exc:
            report["api_football"] = {"status": "error", "reason": safe_failure(exc)}
    odds_key = (env.get("ODDSPAPI_KEY") or "").strip()
    ids_setting = env.get("ODDSPAPI_TOURNAMENT_IDS") or ""
    if odds_key and ids_setting:
        try:
            ids = validate_tournaments(ids_setting)
            query = urllib.parse.urlencode({
                "tournamentIds": ",".join(map(str, ids)),
                "bookmaker": "superbet.pl",
                "language": "en",
                "verbosity": 3,
                "apiKey": odds_key,
            })
            body = get_json(ODDS_HOST + "?" + query)
            report["superbet_pl_odds"] = {"status": "connected", **summarize_odds(body),
                                            "tournaments_checked": len(ids)}
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError) as exc:
            report["superbet_pl_odds"] = {"status": "error", "reason": safe_failure(exc)}
    elif odds_key:
        report["superbet_pl_odds"] = {"status": "needs_tournament_ids"}
    return report


def main():
    report = generate()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Never log raw URLs, provider payloads or credentials.
    print("MARKET CONNECTIVITY " + json.dumps({
        "api_football": report["api_football"]["status"],
        "superbet_pl_odds": report["superbet_pl_odds"]["status"],
    }))


if __name__ == "__main__":
    main()
