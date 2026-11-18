"""Fill an empty shop with about a year of realistic records, so the app can be tried at once.

The sales come from the same simulator the model was trained on (a different random shop), the
ingredients and recipes from the catalog, and the stock from a simple owner who shops every
couple of days for what the next days will need, with some spoilage of fresh ingredients.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, timedelta

import numpy as np
from sqlalchemy import delete
from sqlalchemy.orm import Session

from laris_ml import synth
from laris_ml.catalog import INGREDIENTS

from . import store
from .models import (DailySale, DayStatus, Expense, Ingredient, MenuItem, Order, OrderLine, PreOrder, PreOrderLine,
                     PromoPlan, RecipeLine, StockMove)

LOCATION = {"warung_makan": "kantor", "kafe": "kampus"}
NAMES = {"warung_makan": "Warung Bu Sri (contoh)", "kafe": "Kopi Senja (contoh)"}


def clear(s: Session) -> None:
    for t in (OrderLine, Order, PreOrderLine, PreOrder, StockMove, DailySale, DayStatus, PromoPlan, RecipeLine,
              MenuItem, Ingredient, Expense):
        s.execute(delete(t))


def load(s: Session, business: str = "warung_makan", days: int = 400, end: date | None = None) -> dict:
    clear(s)
    t = end or store.today(s)
    last = t - timedelta(days=1)
    shop = synth.demo_shop(last, days=days, business=business, location=LOCATION[business])
    store.put(s, "business", business)
    store.put(s, "shop_name", NAMES[business])
    used = sorted({k for sr in shop.series for k in sr.item.recipe})
    ings = {}
    for k in used:
        c = INGREDIENTS[k]
        g = Ingredient(name=c.name, unit=c.unit, cost_per_unit=c.cost, shelf_life_days=c.shelf_life_days,
                       lead_time_days=c.lead_time_days, pack_size=c.pack, pack_name=c.pack_name)
        s.add(g)
        ings[k] = g
    s.flush()
    items = {}
    for n, sr in enumerate(shop.series):
        it = MenuItem(name=sr.item.name, category=sr.item.category, price=sr.item.price, sort=n)
        it.created = sr.dates[0].to_pydatetime()
        s.add(it)
        s.flush()
        for k, amount in sr.item.recipe.items():
            s.add(RecipeLine(item_id=it.id, ingredient_id=ings[k].id, amount=amount))
        items[sr.item.key] = (it, sr)
    closed_any = np.zeros(days, dtype=bool)
    start = last - timedelta(days=days - 1)
    for it, sr in items.values():
        off = (sr.dates[0].date() - start).days
        closed_any[off:off + len(sr.closed)] |= sr.closed
    sales_rows = []
    items_price = {it.id: it.price for it, _ in items.values()}
    for it, sr in items.values():
        for d, q, so, pr, cl in zip(sr.dates, sr.qty, sr.stockout, sr.promo, sr.closed):
            if not cl:
                sales_rows.append({"day": d.date(), "item_id": it.id, "qty": int(q), "stockout": bool(so),
                                   "promo": bool(pr)})
    s.execute(DailySale.__table__.insert(), sales_rows)
    for k in np.flatnonzero(closed_any):
        s.add(DayStatus(day=start + timedelta(days=int(k)), closed=True, note="tutup"))

    # ingredient use per day
    use = defaultdict(lambda: np.zeros(days))
    for it, sr in items.values():
        off = (sr.dates[0].date() - start).days
        for k, amount in sr.item.recipe.items():
            use[k][off:off + len(sr.qty)] += sr.qty * amount
    rng = np.random.default_rng(3)
    moves = []
    for k, u in use.items():
        c = INGREDIENTS[k]
        g = ings[k]
        stock = 0.0
        every = 1 if c.shelf_life_days <= 3 else 2
        for day_i in range(days):
            d = start + timedelta(days=day_i)
            if day_i % every == 0:
                horizon = min(days, day_i + every + 1)
                need = u[day_i:horizon].sum() * rng.uniform(1.0, 1.25) - stock
                if need > 0:
                    packs = math.ceil(need / c.pack)
                    q = packs * c.pack
                    moves.append({"day": d, "ingredient_id": g.id, "kind": "beli", "qty": float(q),
                                  "cost": float(q * c.cost * rng.uniform(0.95, 1.08)), "note": "", "auto": False})
                    stock += q
            if u[day_i]:
                moves.append({"day": d, "ingredient_id": g.id, "kind": "pakai", "qty": -float(u[day_i]), "cost": 0.0,
                              "note": "dari penjualan", "auto": True})
                stock -= u[day_i]
            if c.shelf_life_days <= 3 and stock > 0 and rng.random() < 0.15:
                w = float(min(stock, stock * rng.uniform(0.05, 0.3)))
                moves.append({"day": d, "ingredient_id": g.id, "kind": "buang", "qty": -w, "cost": 0.0,
                              "note": "basi", "auto": False})
                stock -= w
        # end with a stock count: most ingredients have a day or a few left, some are nearly out
        daily = float(u[-28:].mean())
        days_left = rng.choice([rng.uniform(0.2, 0.8), rng.uniform(1, 3), rng.uniform(3, 8)], p=[0.3, 0.45, 0.25])
        target = daily * min(days_left, c.shelf_life_days)
        if c.unit == "pcs":
            target = float(round(target))
        moves.append({"day": last, "ingredient_id": g.id, "kind": "opname", "qty": float(target - stock),
                      "cost": 0.0, "note": "hitung stok", "auto": False})
    s.execute(StockMove.__table__.insert(), moves)
    s.execute(Expense.__table__.insert(), demo_expenses(start, last, business, closed_any, rng))
    # profile of the demo shop, so every page has something to show
    store.put(s, "owner_name", "Bu Sri" if business == "warung_makan" else "Raka")
    store.put(s, "location", LOCATION[business])
    store.put(s, "city", "Bandung")
    off = sorted({(start + timedelta(days=int(k))).weekday() for k in range(days)
                  if all(closed_any[j] for j in range(k % 7, days, 7))})
    store.put(s, "open_days", ",".join(str(d) for d in range(7) if d not in off))
    month_rev = sum(r["qty"] * items_price[r["item_id"]] for r in sales_rows if r["day"] > last - timedelta(days=30))
    store.put(s, "target_revenue", str(int(-(-month_rev // 5_000_000) * 5_000_000)))
    store.bump(s)
    s.commit()
    return {"items": len(items), "ingredients": len(ings), "days": days, "sales_rows": len(sales_rows)}


# Running costs of the demo shop (clearly a made-up example, like its name says).
DEMO_COSTS = {
    # (amount, every n days) or a monthly bill; weekly items are paid on Saturday
    "warung_makan": {"gas": (48_000, 1), "gaji": (1_800_000, 7), "kemasan": (150_000, 7), "transport": (25_000, 2),
                     "listrik_air": 650_000, "sewa": 2_500_000},
    "kafe": {"gas": (24_000, 2), "gaji": (2_400_000, 7), "kemasan": (250_000, 7), "transport": (20_000, 3),
             "listrik_air": 1_200_000, "sewa": 3_500_000},
}


def demo_expenses(start: date, last: date, business: str, closed: np.ndarray, rng) -> list[dict]:
    costs = DEMO_COSTS[business]
    rows = []
    d, k = start, 0
    while d <= last:
        for cat, v in costs.items():
            if isinstance(v, tuple):
                amount, every = v
                due = d.weekday() == 5 if every == 7 else k % every == every - 1
                if due and not closed[k]:
                    rows.append({"day": d, "category": cat, "amount": float(round(amount * rng.uniform(0.9, 1.1), -3)),
                                 "note": ""})
            elif cat == "sewa" and d.day == 1:
                rows.append({"day": d, "category": cat, "amount": float(v), "note": ""})
            elif cat == "listrik_air" and d.day == 5:
                rows.append({"day": d, "category": cat, "amount": float(round(v * rng.uniform(0.9, 1.15), -3)),
                             "note": ""})
        d += timedelta(days=1)
        k += 1
    return rows
