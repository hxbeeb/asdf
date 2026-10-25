from datetime import date, datetime, timezone

from main import choose_asof, decision_cutoff, metrics


def test_choose_asof_excludes_future_publication():
    cutoff = datetime(2025, 12, 31, 11, tzinfo=timezone.utc)
    rows = [
        {"publishTime": "2025-12-31T10:30:00Z", "generation": 100},
        {"publishTime": "2025-12-31T12:30:00Z", "generation": 200},
    ]
    assert choose_asof(rows, cutoff)["generation"] == 100


def test_cutoff_is_previous_market_day_in_january():
    assert decision_cutoff(date(2026, 1, 1), 11) == datetime(2025, 12, 31, 11, tzinfo=timezone.utc)


def test_metrics_have_expected_sign_convention():
    outcome = metrics([{"actualMW": 100, "errorMW": -20}, {"actualMW": 100, "errorMW": 10}])
    assert outcome["maeMW"] == 15
    assert outcome["biasMW"] == -5
    assert outcome["underForecastRate"] == 50.0
