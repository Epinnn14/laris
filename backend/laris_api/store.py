"""Reading and writing shop data. Recording a day's sales also books the ingredients it used, so
stock follows sales without extra typing."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from .models import DailySale, DayStatus, Ingredient, MenuItem, PromoPlan, RecipeLine, Setting, StockMove

DEFAULTS = {
    "shop_name": "Warung Saya",
    "business": "warung_makan",
    "cycle_days": "1",       # how often the owner goes shopping
    "service_level": "0.9",  # how sure the shopping list should be that nothing runs out
    "timezone": "Asia/Jakarta",
    "data_version": "0",
}


def get(s: Session, key: str) -> str:
    row = s.get(Setting, key)
    return row.value if row else DEFAULTS.get(key, "")


def put(s: Session, key: str, value: str) -> None:
    row = s.get(Setting, key)
    if row:
        row.value = value
    else:
        s.add(Setting(key=key, value=value))


def bump(s: Session) -> None:
    """Something changed: forecasts and plans need to be computed again."""
    put(s, "data_version", str(int(get(s, "data_version") or 0) + 1))


def today(s: Session) -> date:
    override = get(s, "today")  # for demos and tests
    if override:
        return date.fromisoformat(override)
    return datetime.now(ZoneInfo(get(s, "timezone") or "Asia/Jakarta")).date()


def menu(s: Session, active_only: bool = True) -> list[MenuItem]:
    q = select(MenuItem).options(selectinload(MenuItem.recipe).selectinload(RecipeLine.ingredient))
    if active_only:
        q = q.where(MenuItem.active)
    return list(s.scalars(q.order_by(MenuItem.sort, MenuItem.id)))


def ingredients(s: Session, active_only: bool = True) -> list[Ingredient]:
    q = select(Ingredient)
    if active_only:
        q = q.where(Ingredient.active)
    return list(s.scalars(q.order_by(Ingredient.name)))


def stock_levels(s: Session) -> dict[int, float]:
    rows = s.execute(select(StockMove.ingredient_id, func.sum(StockMove.qty)).group_by(StockMove.ingredient_id))
    return {i: float(q or 0) for i, q in rows}


def recipe_map(items: list[MenuItem]) -> dict[int, dict[int, float]]:
    return {it.id: {r.ingredient_id: r.amount for r in it.recipe} for it in items}


def record_day(s: Session, day: date, entries: list[dict], closed: bool | None = None, note: str | None = None) -> None:
    """Save the sales of one day (replacing what was there) and book the ingredients they used."""
    if closed is not None:
        st = s.get(DayStatus, day)
        if closed:
            if st:
                st.closed, st.note = True, note if note is not None else st.note
            else:
                s.add(DayStatus(day=day, closed=True, note=note or ""))
        elif st:
            s.delete(st)
    existing = {r.item_id: r for r in s.scalars(select(DailySale).where(DailySale.day == day))}
    for e in entries:
        row = existing.get(e["item_id"])
        qty = max(0, int(e.get("qty", 0)))
        if row:
            row.qty, row.stockout, row.promo = qty, bool(e.get("stockout")), bool(e.get("promo"))
        else:
            s.add(DailySale(day=day, item_id=e["item_id"], qty=qty, stockout=bool(e.get("stockout")),
                            promo=bool(e.get("promo"))))
    s.flush()
    rebook_usage(s, day)
    bump(s)


def rebook_usage(s: Session, day: date) -> None:
    s.execute(delete(StockMove).where(StockMove.day == day, StockMove.auto))
    rec = recipe_map(menu(s, active_only=False))
    use: dict[int, float] = defaultdict(float)
    for r in s.scalars(select(DailySale).where(DailySale.day == day)):
        for ing, amount in rec.get(r.item_id, {}).items():
            use[ing] += amount * r.qty
    for ing, q in use.items():
        if q:
            s.add(StockMove(day=day, ingredient_id=ing, kind="pakai", qty=-q, auto=True, note="dari penjualan"))


def add_stock(s: Session, day: date, ingredient_id: int, kind: str, qty: float, cost: float = 0, note: str = "") -> StockMove:
    if kind == "opname":  # qty is the counted amount; store the difference
        qty = qty - stock_levels(s).get(ingredient_id, 0.0)
    elif kind in ("buang", "pakai"):
        qty = -abs(qty)
    else:
        qty = abs(qty)
    mv = StockMove(day=day, ingredient_id=ingredient_id, kind=kind, qty=qty, cost=cost, note=note)
    s.add(mv)
    bump(s)
    return mv


def sales_frame(s: Session, start: date, end: date) -> list[DailySale]:
    """Sales rows with start <= day <= end."""
    return list(s.scalars(select(DailySale).where(DailySale.day >= start, DailySale.day <= end)))


def closed_days(s: Session, start: date, end: date) -> dict[date, str]:
    return {r.day: r.note for r in s.scalars(select(DayStatus).where(DayStatus.day >= start, DayStatus.day <= end,
                                                                      DayStatus.closed))}


def recorded_days(s: Session, start: date, end: date) -> set[date]:
    return set(s.scalars(select(DailySale.day).where(DailySale.day >= start, DailySale.day <= end).distinct()))


def promo_days(s: Session, start: date, end: date) -> dict[tuple[int, date], bool]:
    out = {}
    for p in s.scalars(select(PromoPlan).where(PromoPlan.end >= start, PromoPlan.start <= end)):
        d = max(p.start, start)
        while d <= min(p.end, end):
            out[(p.item_id, d)] = True
            d += timedelta(days=1)
    return out
