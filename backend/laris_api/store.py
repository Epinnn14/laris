"""Reading and writing shop data. Recording a day's sales also books the ingredients it used, so
stock follows sales without extra typing."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from .models import (DailySale, DayStatus, Ingredient, MenuItem, Order, OrderLine, PreOrder, PromoPlan, RecipeLine,
                     Setting, StockMove)

DEFAULTS = {
    "shop_name": "Warung Saya",
    "business": "warung_makan",
    "cycle_days": "1",       # how often the owner goes shopping
    "service_level": "0.9",  # how sure the shopping list should be that nothing runs out
    "timezone": "Asia/Jakarta",
    "data_version": "0",
    "owner_name": "",
    "location": "lainnya",       # kantor, kampus, perumahan, wisata, pasar, lainnya
    "city": "",
    "open_days": "0,1,2,3,4,5,6",  # weekdays the shop opens, 0 = Monday
    "target_revenue": "0",      # monthly revenue target, 0 = none
    "target_margin": "0.6",     # wished share of the price left after ingredients
    "language": "id",
}

# The model was trained on warung makan and kafe with four categories. A kios / toko kelontong
# and its extra categories are read by the model as the closest pattern it knows.
BUSINESSES = ("warung_makan", "kafe", "kios")
CATEGORIES = ("makanan", "camilan", "minuman_dingin", "minuman_panas", "sembako", "kebutuhan_rumah")
MODEL_BUSINESS = {"kios": "warung_makan"}
MODEL_CATEGORY = {"sembako": "makanan", "kebutuhan_rumah": "camilan"}

EXPENSE_CATEGORIES = ("gas", "listrik_air", "sewa", "gaji", "kemasan", "transport", "lainnya")
LOCATIONS = ("kantor", "kampus", "perumahan", "wisata", "pasar", "lainnya")


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


def now(s: Session) -> datetime:
    """Shop-local time (naive), on the overridden day in demos and tests."""
    t = datetime.now(ZoneInfo(get(s, "timezone") or "Asia/Jakarta")).replace(tzinfo=None, microsecond=0)
    d = today(s)
    return t if t.date() == d else datetime.combine(d, t.time())


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


def closed_days(s: Session, start: date, end: date, include_off: bool = True) -> dict[date, str]:
    """Days marked closed. With include_off, the shop's regular days off count too, unless sales
    were recorded on them (the owner opened after all)."""
    out = {r.day: r.note for r in s.scalars(select(DayStatus).where(DayStatus.day >= start, DayStatus.day <= end,
                                                                     DayStatus.closed))}
    off = off_weekdays(s) if include_off else set()
    if off:
        rec = recorded_days(s, start, end)
        d = start
        while d <= end:
            if d.weekday() in off and d not in rec and d not in out:
                out[d] = "libur rutin"
            d += timedelta(days=1)
    return out


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


def off_weekdays(s: Session) -> set[int]:
    """Weekdays the owner said the shop does not open."""
    raw = get(s, "open_days")
    open_ = {int(x) for x in raw.split(",") if x.strip().isdigit() and 0 <= int(x) <= 6} if raw else set(range(7))
    return set(range(7)) - open_ if open_ else set()


# ---------------------------------------------------------------- till

def add_to_day(s: Session, day: date, deltas: dict[int, int]) -> None:
    """Add (or take back) portions to a day's totals, and book the ingredients they used.
    Incremental, so a busy till does not rebuild the whole day for every order."""
    rows = {r.item_id: r for r in s.scalars(select(DailySale).where(DailySale.day == day,
                                                                   DailySale.item_id.in_(list(deltas))))}
    applied: dict[int, int] = {}
    for item_id, d in deltas.items():
        row = rows.get(item_id)
        if row:
            new = max(0, row.qty + d)
            applied[item_id] = new - row.qty
            row.qty = new
        elif d > 0:
            s.add(DailySale(day=day, item_id=item_id, qty=d))
            applied[item_id] = d
    use: dict[int, float] = defaultdict(float)
    for r in s.scalars(select(RecipeLine).where(RecipeLine.item_id.in_(list(applied)))):
        use[r.ingredient_id] += r.amount * applied[r.item_id]
    if use:
        moves = {m.ingredient_id: m for m in s.scalars(select(StockMove).where(
            StockMove.day == day, StockMove.auto, StockMove.ingredient_id.in_(list(use))))}
        for ing, q in use.items():
            m = moves.get(ing)
            if m:
                m.qty -= q
                if abs(m.qty) < 1e-9:
                    s.delete(m)
            elif q:
                s.add(StockMove(day=day, ingredient_id=ing, kind="pakai", qty=-q, auto=True, note="dari penjualan"))
    s.flush()
    if day < today(s):  # today's sales are not in the forecast's history yet
        bump(s)


def create_order(s: Session, lines: list[tuple[int, int]], method: str = "tunai", cash: int | None = None,
                 note: str = "") -> Order:
    ids = {i for i, _ in lines}
    items = {it.id: it for it in s.scalars(select(MenuItem).where(MenuItem.id.in_(ids), MenuItem.active))}
    merged: dict[int, int] = defaultdict(int)
    for item_id, qty in lines:
        if item_id in items and qty > 0:
            merged[item_id] += qty
    if not merged:
        raise ValueError("empty order")
    t = now(s)
    o = Order(day=t.date(), number=0, created=t, method=method, cash=cash, note=note,
              total=sum(items[i].price * q for i, q in merged.items()))
    o.lines = [OrderLine(item_id=i, qty=q, price=items[i].price) for i, q in merged.items()]
    s.add(o)
    s.flush()
    # the number within the day follows the insert order (ids grow), safe with several tills
    o.number = s.scalar(select(func.count(Order.id)).where(Order.day == o.day, Order.id <= o.id))
    add_to_day(s, o.day, dict(merged))
    return o


def void_order(s: Session, o: Order) -> None:
    if o.void:
        return
    o.void = True
    add_to_day(s, o.day, {ln.item_id: -ln.qty for ln in o.lines})


# ---------------------------------------------------------------- special orders

def preorder_note(p: PreOrder) -> str:
    return f"pesanan #{p.id}"


def book_preorder(s: Session, p: PreOrder) -> None:
    """Ingredients of a finished special order leave the stock (once); undone if it is reopened."""
    s.execute(delete(StockMove).where(StockMove.note == preorder_note(p), StockMove.kind == "pakai",
                                      StockMove.auto.is_(False)))
    if p.status != "selesai":
        return
    rec = recipe_map(menu(s, active_only=False))
    use: dict[int, float] = defaultdict(float)
    for ln in p.lines:
        for ing, amount in rec.get(ln.item_id, {}).items():
            use[ing] += amount * ln.qty
    day = min(p.due, today(s))
    for ing, q in use.items():
        if q:
            s.add(StockMove(day=day, ingredient_id=ing, kind="pakai", qty=-q, note=preorder_note(p)))
