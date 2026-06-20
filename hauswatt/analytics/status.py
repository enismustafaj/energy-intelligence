"""Status-quo ETL — the annualized 'where you stand today' snapshot.

Aggregates the household's full available history into one normalized-to-a-year
picture (so advice and counterfactuals compare apples-to-apples), plus the
latest instantaneous status for the live hub. Every rule reads this rather than
re-deriving totals.
"""

from __future__ import annotations

import sqlite3
from dataclasses import asdict, dataclass

from ..db import get_contract
from . import costing, frames, metrics


@dataclass
class StatusQuo:
    household_id: str
    span_days: float
    annual_factor: float            # multiply period figures to annualize
    consumption_kwh: float          # annualized
    pv_production_kwh: float
    grid_import_kwh: float
    grid_export_kwh: float
    pv_self_consumption_pct: float | None
    annual_cost_eur: float          # annualized total bill
    month_to_date_cost_eur: float   # cost so far in the latest month of data
    month_estimated_cost_eur: float # projected full-month cost (end of month)
    baseload_kw: float | None
    device_kwh: dict                # category -> annualized kWh
    latest: dict | None

    def as_dict(self) -> dict:
        return asdict(self)


def _monthly_costs(df, feed_in: float, base_fee: float) -> tuple[float, float]:
    """Cost for the latest calendar month present in the data.

    Returns (month_to_date, estimated_full_month). Month-to-date is the real cost
    of every reading from the 1st of the latest month through the latest reading.
    The estimate linearly projects that month's *energy* cost (import minus
    feed-in) to the whole month by elapsed-time, then adds one full base fee.
    """
    import calendar

    if df.empty:
        return 0.0, 0.0

    latest = df.index.max()
    month_start = latest.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month = df[df.index >= month_start]
    if month.empty:
        return 0.0, 0.0

    # Energy cost so far this month (import minus feed-in). The base fee is handled
    # separately below so month-to-date and the projection share one convention —
    # otherwise replay_cost's /30 proration vs. a calendar month makes the two
    # legs disagree (and the estimate can dip below MTD) even for a full month.
    energy = costing.replay_cost(month, feed_in_eur_per_kwh=feed_in,
                                 base_fee_eur_per_month=0.0)
    energy_so_far = energy.energy_cost_eur - energy.feed_in_credit_eur

    # Elapsed fraction of THIS calendar month, by real days.
    days_in_month = calendar.monthrange(latest.year, latest.month)[1]
    elapsed_days = (latest - month_start).total_seconds() / 86400 + frames.STEP_HOURS / 24
    frac = min(elapsed_days / days_in_month, 1.0) if days_in_month else 1.0

    # Both legs prorate the base fee by the same fraction, so a complete month
    # (frac == 1) gives estimated == month-to-date.
    month_to_date = energy_so_far + base_fee * frac
    projected_energy = energy_so_far / frac if frac > 0 else energy_so_far
    estimated = projected_energy + base_fee

    return month_to_date, estimated


def status_quo(conn: sqlite3.Connection, household_id: str) -> StatusQuo | None:
    """Full-history snapshot, annualized."""
    df = frames.load_window(conn, household_id)
    if df.empty:
        return None
    contract = get_contract(conn, household_id)
    feed_in = contract["feed_in_eur_per_kwh"] if contract else 0.081
    base_fee = contract["base_fee_eur_per_month"] if contract else 0.0

    span_days = (df.index.max() - df.index.min()).total_seconds() / 86400 + 0.25 / 24
    annual_factor = 365.0 / span_days if span_days > 0 else 1.0

    tot = metrics.energy_totals(df)
    cost = costing.replay_cost(df, feed_in_eur_per_kwh=feed_in,
                               base_fee_eur_per_month=base_fee)

    mtd_cost, est_cost = _monthly_costs(df, feed_in, base_fee)

    def by_device(col: str) -> float:
        return round(metrics._sum_kwh(df, col) * annual_factor, 0)

    return StatusQuo(
        household_id=household_id,
        span_days=round(span_days, 1),
        annual_factor=round(annual_factor, 4),
        consumption_kwh=round(tot.consumption_kwh * annual_factor, 0),
        pv_production_kwh=round(tot.pv_production_kwh * annual_factor, 0),
        grid_import_kwh=round(tot.grid_import_kwh * annual_factor, 0),
        grid_export_kwh=round(tot.grid_export_kwh * annual_factor, 0),
        pv_self_consumption_pct=tot.pv_self_consumption_pct,
        annual_cost_eur=round(cost.total_eur * annual_factor, 0),
        month_to_date_cost_eur=round(mtd_cost, 2),
        month_estimated_cost_eur=round(est_cost, 2),
        baseload_kw=metrics.baseload_kw(df),
        device_kwh={
            "heat_pump": by_device("heatpump_kw"),
            "ev": by_device("ev_charging_kw"),
            "household": by_device("house_load_kw"),
            "pv": by_device("pv_production_kw"),
            "battery_charge": by_device("battery_charge_kw"),
            "battery_discharge": by_device("battery_discharge_kw"),
        },
        latest=metrics.latest_status(df),
    )
