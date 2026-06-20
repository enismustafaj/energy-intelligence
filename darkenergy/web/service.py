"""Dashboard service layer: assemble the per-household view from analytics.

Everything here is tenant-scoped — it always takes a ``household_id`` and only
ever reads that tenant's data through ``frames.load_window`` and the scoped
helpers. Detectors run, facts are phrased, and the result is a single dict the
templates and SSE handler render.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

from ..analytics import anomalies, facts, forecast, frames, metrics
from ..ai.phraser import get_phraser
from ..db import get_contract, get_household, telemetry_time_range, upsert_detected_insight


def _latest_ts(conn: sqlite3.Connection, household_id: str) -> datetime | None:
    rng = telemetry_time_range(conn, household_id)
    if rng is None:
        return None
    return datetime.fromisoformat(rng[1])


def household_summary(conn: sqlite3.Connection, household_id: str) -> dict | None:
    """Full dashboard payload for one tenant."""
    h = get_household(conn, household_id)
    if h is None:
        return None
    contract = get_contract(conn, household_id)
    as_of = _latest_ts(conn, household_id)

    assets = {
        "battery": bool(h["battery_kwh"] and h["battery_kwh"] > 0),
        "heat_pump": bool(h["heat_pump"]),
        "ev": bool(h["ev_charger"]),
        "pv": bool(h["pv_kwp"] and h["pv_kwp"] > 0),
    }

    status = month = month_cost = bill_fc = None
    breakdown = {}
    if as_of is not None:
        # Current calendar month window for the home's latest data.
        month_start = as_of.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        mdf = frames.load_window(conn, household_id, month_start, as_of + timedelta(minutes=15))
        status = metrics.latest_status(mdf)
        month = metrics.energy_totals(mdf)
        feed_in = (contract["feed_in_eur_per_kwh"] if contract else 0.081)
        base_fee = (contract["base_fee_eur_per_month"] if contract else 0.0)
        month_cost = metrics.energy_cost(mdf, feed_in, base_fee)
        breakdown = metrics.device_breakdown(mdf)
        bill_fc = forecast.forecast_bill(conn, household_id, as_of, feed_in, base_fee)

    insights = _insights(conn, household_id)

    return {
        "household": dict(h),
        "assets": assets,
        "as_of": as_of.isoformat() if as_of else None,
        "status": status,
        "month": month.as_dict() if month else None,
        "month_cost": month_cost,
        "breakdown": breakdown,
        "bill_forecast": bill_fc,
        "insights": insights,
    }


def _insights(conn: sqlite3.Connection, household_id: str) -> list[dict]:
    """Run detectors, persist them, phrase the facts, and merge with seeded events."""
    detected = anomalies.detect_all(conn, household_id)
    bundle = facts.build_bundle(conn, household_id, detected)
    phrased = {p.fact_key: p for p in get_phraser().phrase(bundle)}

    out: list[dict] = []
    for fact in detected:
        pi = phrased.get(fact.key)
        title = pi.title if pi else fact.title
        body = pi.body if pi else fact.detail
        upsert_detected_insight(conn, facts.fact_to_event_row(fact, phrased_text=body))
        out.append({
            "fact_key": fact.key,
            "type": fact.type,
            "severity": fact.severity,
            "title": title,
            "body": body,
            "action_type": fact.suggested_action_key,
            "action_label": pi.action_label if pi else None,
        })
    return out
