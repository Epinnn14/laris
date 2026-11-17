"""Numbers for the dashboard: what sold, what earned, which days were busy, what is running low."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import store
from .models import Expense, StockMove

DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]


def unit_cost(item) -> float:
    return sum(r.amount * r.ingredient.cost_per_unit for r in item.recipe)


def _period(s: Session, start: date, end: date, items: dict) -> dict:
    rows = store.sales_frame(s, start, end)
    closed = store.closed_days(s, start, end)
    by_day = defaultdict(lambda: {"revenue": 0.0, "portions": 0, "cost": 0.0})
    by_item = defaultdict(lambda: {"qty": 0, "revenue": 0.0, "cost": 0.0, "stockouts": 0})
    for r in rows:
        it = items.get(r.item_id)
        if not it:
            continue
        rev = r.qty * it["price"]
        c = r.qty * it["cost"]
        by_day[r.day]["revenue"] += rev
        by_day[r.day]["portions"] += r.qty
        by_day[r.day]["cost"] += c
        bi = by_item[r.item_id]
        bi["qty"] += r.qty
        bi["revenue"] += rev
        bi["cost"] += c
        bi["stockouts"] += int(r.stockout)
    open_days = [d for d in by_day if d not in closed]
    revenue = sum(v["revenue"] for v in by_day.values())
    cost = sum(v["cost"] for v in by_day.values())
    return {"by_day": by_day, "by_item": by_item, "closed": closed, "revenue": revenue, "cost": cost,
            "portions": sum(v["portions"] for v in by_day.values()), "open_days": len(open_days)}


def waste_cost(s: Session, start: date, end: date) -> float:
    rows = s.execute(select(StockMove).where(StockMove.kind == "buang", StockMove.day >= start,
                                             StockMove.day <= end)).scalars().all()
    ing_cost = {g.id: g.cost_per_unit for g in store.ingredients(s, active_only=False)}
    return sum(-m.qty * ing_cost.get(m.ingredient_id, 0) for m in rows)


def expenses(s: Session, start: date, end: date) -> dict[str, float]:
    out: dict[str, float] = defaultdict(float)
    for e in s.scalars(select(Expense).where(Expense.day >= start, Expense.day <= end)):
        out[e.category] += e.amount
    return dict(out)


def money(s: Session, start: date, end: date, items: dict) -> dict:
    """Revenue down to net profit for a period: what came in, what the sold portions cost in
    ingredients, what was thrown away, and the other costs of running the shop."""
    p = _period(s, start, end, items)
    w = waste_cost(s, start, end)
    ex = expenses(s, start, end)
    gross = p["revenue"] - p["cost"]
    return {**p, "gross": gross, "waste": w, "expenses": ex, "expense_total": sum(ex.values()),
            "net": gross - w - sum(ex.values())}


def item_table(s: Session) -> dict:
    return {it.id: {"name": it.name, "category": it.category, "price": it.price, "cost": unit_cost(it),
                    "active": it.active} for it in store.menu(s, active_only=False)}


def _change(now: float, before: float) -> float | None:
    return None if before == 0 else round((now - before) / before, 3)


def dashboard(s: Session, days: int = 30) -> dict:
    t = store.today(s)
    end = t - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    items = item_table(s)
    cur = money(s, start, end, items)
    prev = money(s, prev_start, prev_end, items)

    # daily series with a "how busy" label against the same weekday's usual level
    hist = _period(s, start - timedelta(days=56), end, items)
    by_dow = defaultdict(list)
    for d, v in hist["by_day"].items():
        if d not in hist["closed"] and v["portions"] > 0:
            by_dow[d.weekday()].append(v["portions"])
    typical = {k: float(np.median(v)) for k, v in by_dow.items()}
    rev_dow = defaultdict(list)
    for d, v in hist["by_day"].items():
        if d not in hist["closed"] and v["revenue"] > 0:
            rev_dow[d.weekday()].append(v["revenue"])
    usual = {k: round(float(np.median(v))) for k, v in rev_dow.items()}
    series = []
    d = start
    while d <= end:
        v = cur["by_day"].get(d)
        closed = d in cur["closed"]
        level = None
        if v and not closed and typical.get(d.weekday()):
            ratio = v["portions"] / typical[d.weekday()]
            level = "ramai" if ratio >= 1.15 else "sepi" if ratio <= 0.85 else "normal"
        series.append({"date": d.isoformat(), "revenue": round(v["revenue"]) if v else 0,
                       "portions": v["portions"] if v else 0, "profit": round(v["revenue"] - v["cost"]) if v else 0,
                       "closed": closed, "recorded": v is not None, "level": level,
                       "usual": usual.get(d.weekday(), 0),
                       "note": cur["closed"].get(d, "")})
        d += timedelta(days=1)

    top = []
    for iid, v in cur["by_item"].items():
        it = items[iid]
        pv = prev["by_item"].get(iid, {"qty": 0})
        top.append({"id": iid, "name": it["name"], "category": it["category"], "price": it["price"], "qty": v["qty"],
                    "revenue": round(v["revenue"]), "profit": round(v["revenue"] - v["cost"]),
                    "margin": round(1 - it["cost"] / it["price"], 3) if it["price"] else None,
                    "change": _change(v["qty"], pv["qty"]), "stockouts": v["stockouts"]})
    top.sort(key=lambda x: -x["revenue"])
    # ABC: items making the first 80% of revenue are A, the next 15% B, the rest C
    acc, total = 0.0, max(cur["revenue"], 1)
    for x in top:
        acc += x["revenue"]
        x["abc"] = "A" if acc / total <= 0.8 or x is top[0] else "B" if acc / total <= 0.95 else "C"

    weekday = []
    for k in range(7):
        vals = [v["revenue"] for d2, v in hist["by_day"].items() if d2.weekday() == k and d2 not in hist["closed"]]
        weekday.append({"day": DAY_NAMES[k], "revenue": round(float(np.mean(vals))) if vals else 0})
    cats = defaultdict(float)
    for iid, v in cur["by_item"].items():
        cats[items[iid]["category"]] += v["revenue"]

    open_series = [x for x in series if x["recorded"] and not x["closed"]]
    best = max(open_series, key=lambda x: x["revenue"], default=None)
    quiet = min(open_series, key=lambda x: x["revenue"], default=None)

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
        "kpi": {
            "revenue": round(cur["revenue"]), "revenue_change": _change(cur["revenue"], prev["revenue"]),
            "profit": round(cur["revenue"] - cur["cost"]),
            "profit_change": _change(cur["revenue"] - cur["cost"], prev["revenue"] - prev["cost"]),
            "portions": cur["portions"], "portions_change": _change(cur["portions"], prev["portions"]),
            "avg_per_open_day": round(cur["revenue"] / cur["open_days"]) if cur["open_days"] else 0,
            "open_days": cur["open_days"], "waste_cost": round(cur["waste"]),
            "ingredient_cost": round(cur["cost"]), "expenses": round(cur["expense_total"]),
            "net_profit": round(cur["net"]), "net_change": _change(cur["net"], prev["net"]) if prev["net"] > 0 else None,
            "best_day": {"date": best["date"], "revenue": best["revenue"]} if best else None,
            "quiet_day": {"date": quiet["date"], "revenue": quiet["revenue"]} if quiet else None,
        },
        "expenses": [{"category": k, "amount": round(v)} for k, v in sorted(cur["expenses"].items(), key=lambda x: -x[1])],
        "series": series, "items": top, "weekday": weekday,
        "categories": [{"category": k, "revenue": round(v)} for k, v in sorted(cats.items(), key=lambda x: -x[1])],
    }
