"""The week in a few facts: what changed, what went wrong, what to do next.

The API returns facts, not sentences, so the app can phrase them in the owner's language.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
from sqlalchemy.orm import Session

from . import analytics, store

MIN_QTY = 10       # an item needs this many portions in a week before its change is worth mentioning
MOVE = 0.15        # a change of 15% or more is called a rise or a fall


def _pct(now: float, before: float) -> float | None:
    return None if before <= 0 else round((now - before) / before, 3)


def week(s: Session, forecasts) -> dict:
    t = store.today(s)
    end = t - timedelta(days=1)
    start = end - timedelta(days=6)
    p_end, p_start = start - timedelta(days=1), start - timedelta(days=7)
    items = analytics.item_table(s)
    cur = analytics.money(s, start, end, items)
    prev = analytics.money(s, p_start, p_end, items)

    days = []
    d = start
    while d <= end:
        v = cur["by_day"].get(d)
        days.append({"date": d.isoformat(), "revenue": round(v["revenue"]) if v else 0,
                     "closed": d in cur["closed"], "recorded": v is not None})
        d += timedelta(days=1)
    open_days = [x for x in days if x["recorded"] and not x["closed"]]
    missing = [x["date"] for x in days if not x["recorded"] and not x["closed"]]

    moves = []
    for iid, v in cur["by_item"].items():
        before = prev["by_item"].get(iid, {"qty": 0})["qty"]
        ch = _pct(v["qty"], before)
        if ch is not None and max(v["qty"], before) >= MIN_QTY and abs(ch) >= MOVE:
            moves.append({"id": iid, "name": items[iid]["name"], "qty": v["qty"], "before": before, "change": ch})
    risers = sorted([m for m in moves if m["change"] > 0], key=lambda m: -m["change"])[:3]
    fallers = sorted([m for m in moves if m["change"] < 0], key=lambda m: m["change"])[:3]
    stockouts = sorted([{"id": iid, "name": items[iid]["name"], "days": v["stockouts"]}
                        for iid, v in cur["by_item"].items() if v["stockouts"]], key=lambda x: -x["days"])
    goal_margin = float(store.get(s, "target_margin") or 0.6)
    low_margin = sorted([{"id": iid, "name": it["name"], "margin": round(1 - it["cost"] / it["price"], 3),
                          "price": it["price"], "suggested_price": int(-(-it["cost"] / (1 - goal_margin) // 500) * 500)}
                         for iid, it in items.items()
                         if it["active"] and it["price"] and it["cost"] and 1 - it["cost"] / it["price"] < goal_margin],
                        key=lambda x: x["margin"])
    top = sorted([{"id": iid, "name": items[iid]["name"], "qty": v["qty"], "revenue": round(v["revenue"]),
                   "profit": round(v["revenue"] - v["cost"])} for iid, v in cur["by_item"].items() if v["qty"]],
                 key=lambda x: -x["revenue"])[:3]
    # usual sales per weekday over the last 8 weeks, open days only
    hist = analytics._period(s, end - timedelta(days=55), end, items)
    by_wd: dict[int, list[float]] = {}
    for d, v in hist["by_day"].items():
        if d not in hist["closed"] and v["revenue"] > 0:
            by_wd.setdefault(d.weekday(), []).append(v["revenue"])
    wd_avg = {k: float(np.mean(v)) for k, v in by_wd.items() if len(v) >= 3}
    weekdays = None
    if len(wd_avg) >= 2:
        hi, lo = max(wd_avg, key=wd_avg.get), min(wd_avg, key=wd_avg.get)
        weekdays = {"busiest": hi, "busiest_revenue": round(wd_avg[hi]), "quietest": lo,
                    "quietest_revenue": round(wd_avg[lo])}

    nxt = None
    buy = []
    res = forecasts.compute(s)
    if res.items and res.paths is not None:
        prices = np.array([x.price for x in res.items], dtype=float)
        rev = (res.paths[..., :7] * prices[None, :, None]).sum(axis=(1, 2))
        nxt = {"method": res.method, "revenue": [round(float(np.quantile(rev, q))) for q in (0.1, 0.5, 0.9)],
               "closed_days": int(sum(res.closed[:7]))}
        lst = [p for p in forecasts.shopping(s, res) if p.buy > 0]
        buy = [{"name": p.name, "cost": round(p.cost), "days_left": None if p.days_left == float("inf") else round(p.days_left, 1)}
               for p in sorted(lst, key=lambda p: (p.days_left, -p.cost))[:5]]

    return {
        "start": start.isoformat(), "end": end.isoformat(), "days": days, "missing": missing,
        "revenue": round(cur["revenue"]), "revenue_change": _pct(cur["revenue"], prev["revenue"]),
        "portions": cur["portions"], "gross": round(cur["gross"]), "net": round(cur["net"]),
        "net_before": round(prev["net"]), "expenses": round(cur["expense_total"]), "waste": round(cur["waste"]),
        "best_day": max(open_days, key=lambda x: x["revenue"], default=None),
        "quiet_day": min(open_days, key=lambda x: x["revenue"], default=None),
        "risers": risers, "fallers": fallers, "stockouts": stockouts, "low_margin": low_margin,
        "target_margin": goal_margin, "top": top, "weekdays": weekdays,
        "next_week": nxt, "buy": buy, "target": target(s, forecasts),
    }


def target(s: Session, forecasts) -> dict | None:
    """Progress towards the monthly revenue target, with where the month will probably end."""
    goal = float(store.get(s, "target_revenue") or 0)
    if goal <= 0:
        return None
    t = store.today(s)
    first = t.replace(day=1)
    nxt_month = (first + timedelta(days=32)).replace(day=1)
    last = nxt_month - timedelta(days=1)
    items = analytics.item_table(s)
    done = analytics._period(s, first, t - timedelta(days=1), items)["revenue"] if t > first else 0.0
    res = forecasts.compute(s)
    rest = None
    covered = 0
    from .forecasting import MIN_DAYS
    known = res.items and any(x.history_days >= MIN_DAYS for x in res.items)
    prices = None
    if known and res.paths is not None:
        prices = np.array([x.price for x in res.items], dtype=float)
        n = min((last - t).days + 1, res.paths.shape[-1])
        covered = n
        r = (res.paths[..., :n] * prices[None, :, None]).sum(axis=(1, 2))
        rest = [float(np.quantile(r, q)) for q in (0.1, 0.5, 0.9)]
    days_left = (last - t).days + 1
    shut = store.closed_days(s, t, last)
    open_left = sum(1 for k in range(days_left) if t + timedelta(days=k) not in shut)
    end = [round(done + x) for x in rest] if rest else None
    return {"goal": round(goal), "done": round(done), "month": first.isoformat()[:7], "days_left": days_left,
            "projected": end, "complete": covered >= days_left,
            "chance": round(float(np.mean(_month_totals(res, prices, covered, done) >= goal)), 2) if rest else None,
            "open_days_left": open_left,
            "per_day_needed": round(max(goal - done, 0) / open_left) if open_left else 0}


def _month_totals(res, prices, n, done):
    return done + (res.paths[..., :n] * prices[None, :, None]).sum(axis=(1, 2))
