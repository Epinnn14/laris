"""HTTP API and the web app.

    uvicorn laris_api.main:app        # LARIS_DATABASE_URL, LARIS_MODEL_DIR, LARIS_DEMO_MODE, LARIS_STATIC_DIR
"""

from __future__ import annotations

import csv
import io
import os
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from laris_ml import features as F
from laris_ml.catalog import INGREDIENTS, MENUS

from . import analytics, auth, backup, demo, kios, store, summary
from .db import Database
from .forecasting import SENSITIVITY, Forecasts, scenario
from .models import (DailySale, DayStatus, Expense, Ingredient, MenuItem, Note, Order, PreOrder, PreOrderLine, PromoPlan,
                     RecipeLine, Setting, StockMove)

Q10, Q50, Q90 = (F.QUANTILES.index(q) for q in (0.1, 0.5, 0.9))


# ------------------------------------------------------------------ request bodies

class Profile(BaseModel):
    shop_name: str | None = Field(default=None, min_length=1, max_length=80)
    owner_name: str | None = Field(default=None, max_length=80)
    business: str | None = None
    location: str | None = None
    city: str | None = Field(default=None, max_length=80)
    open_days: list[int] | None = None
    cycle_days: int | None = Field(default=None, ge=1, le=14)
    service_level: float | None = Field(default=None, ge=0.5, le=0.99)
    target_revenue: int | None = Field(default=None, ge=0, le=10_000_000_000)
    target_margin: float | None = Field(default=None, ge=0.05, le=0.95)
    language: str | None = Field(default=None, pattern="^(id|en)$")


class OwnItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = "makanan"
    price: int = Field(ge=0, le=100_000_000)
    cost: float | None = Field(default=None, ge=0, le=100_000_000)  # cost of one portion, if known


class SetupIn(Profile):
    shop_name: str = Field(min_length=1, max_length=80)
    business: str = "warung_makan"
    password: str = Field(min_length=6, max_length=128)
    start: str = Field(default="empty", pattern="^(empty|demo|catalog)$")
    demo: bool = False                 # older clients
    catalog_items: list[str] = []
    catalog_prices: dict[str, int] = {}   # the owner's own price for a sample item
    own_items: list[OwnItemIn] = Field(default=[], max_length=300)


class ResetIn(BaseModel):
    confirm: str


class LoginIn(BaseModel):
    password: str


class SettingsIn(Profile):
    pass


class ExpenseIn(BaseModel):
    day: date
    category: str
    amount: float = Field(gt=0, le=1_000_000_000)
    note: str = Field(default="", max_length=200)


class OrderLineIn(BaseModel):
    item_id: int
    qty: int = Field(gt=0, le=10000)


class OrderIn(BaseModel):
    lines: list[OrderLineIn] = Field(min_length=1, max_length=200)
    method: str = Field(default="tunai", pattern="^(tunai|qris|transfer)$")
    cash: int | None = Field(default=None, ge=0, le=1_000_000_000)
    note: str = Field(default="", max_length=200)


class PreOrderLineIn(BaseModel):
    item_id: int | None = None
    name: str = Field(default="", max_length=120)
    qty: int = Field(gt=0, le=100000)
    price: int = Field(ge=0, le=1_000_000_000)


class PreOrderIn(BaseModel):
    customer: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=40)
    due: date
    due_time: str = Field(default="", pattern=r"^(|([01]\d|2[0-3]):[0-5]\d)$")
    status: str = Field(default="baru", pattern="^(baru|proses|selesai|batal)$")
    dp: int = Field(default=0, ge=0, le=1_000_000_000)
    note: str = Field(default="", max_length=500)
    lines: list[PreOrderLineIn] = Field(min_length=1, max_length=100)


class StatusIn(BaseModel):
    status: str = Field(pattern="^(baru|proses|selesai|batal)$")


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    pinned: bool = False


class SimulateIn(BaseModel):
    item_id: int
    new_price: int | None = Field(default=None, gt=0, le=100_000_000)
    promo_start: date | None = None
    promo_end: date | None = None
    sensitivity: str = "sedang"


class RecipeIn(BaseModel):
    ingredient_id: int
    amount: float = Field(gt=0)


class MenuIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str
    price: int = Field(ge=0)
    active: bool = True
    recipe: list[RecipeIn] = []
    batch_cost: float | None = Field(default=None, ge=0, le=1_000_000_000)
    batch_qty: float | None = Field(default=None, gt=0, le=100_000)


class IngredientIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    unit: str = Field(pattern="^(g|ml|pcs)$")
    cost_per_unit: float = Field(ge=0)
    shelf_life_days: int = Field(ge=1, le=3650)
    lead_time_days: int = Field(ge=0, le=60)
    pack_size: float = Field(gt=0)
    pack_name: str = ""
    active: bool = True


class SaleIn(BaseModel):
    item_id: int
    qty: int = Field(ge=0, le=100000)
    stockout: bool = False
    promo: bool = False


class DayIn(BaseModel):
    closed: bool = False
    note: str = ""
    entries: list[SaleIn] = []


class ClosureIn(BaseModel):
    closed: bool
    note: str = ""


class StockIn(BaseModel):
    day: date | None = None
    ingredient_id: int
    kind: str = Field(pattern="^(beli|buang|opname|pakai)$")
    qty: float = Field(ge=0)
    cost: float = Field(default=0, ge=0)
    note: str = ""


class PromoIn(BaseModel):
    item_id: int
    start: date
    end: date
    note: str = ""


class DemoIn(BaseModel):
    business: str = "warung_makan"


class CatalogApplyIn(BaseModel):
    items: list[str]


# ------------------------------------------------------------------ app

def create_app(db_url: str | None = None, model_dir: str | None = None, demo_mode: bool | None = None,
               static_dir: str | None = None) -> FastAPI:
    db = Database(db_url)
    db.create()
    forecasts = Forecasts(Path(model_dir) if model_dir else None)
    demo_mode = os.environ.get("LARIS_DEMO_MODE", "") == "1" if demo_mode is None else demo_mode
    app = FastAPI(title="Laris", version="0.1.0")
    app.state.db, app.state.forecasts = db, forecasts

    def session():
        yield from db.session()

    def secret(s: Session) -> str:
        sec = store.get(s, "secret")
        if not sec:
            sec = os.environ.get("LARIS_SECRET") or auth.new_secret()
            store.put(s, "secret", sec)
            s.commit()
        return sec

    def authed(request: Request, s: Session = Depends(session)) -> Session:
        if demo_mode:
            return s
        token = request.cookies.get(auth.COOKIE) or request.headers.get("authorization", "").removeprefix("Bearer ")
        if not store.get(s, "password") or not auth.check_token(secret(s), token):
            raise HTTPException(401, "Silakan masuk dulu")
        return s

    def login_cookie(resp: Response, s: Session) -> None:
        resp.set_cookie(auth.COOKIE, auth.make_token(secret(s)), max_age=auth.MAX_AGE, httponly=True,
                        samesite="lax", secure=os.environ.get("LARIS_SECURE_COOKIE") == "1")

    if demo_mode:
        with db.Session() as s:
            if not s.scalar(select(MenuItem.id).limit(1)):
                demo.load(s)
    app.state.backup_stop = backup.start_daily(db.engine)

    # ---- auth and settings

    @app.get("/api/health")
    def health():
        return {"ok": True, "model": forecasts.info()}

    @app.get("/api/state")
    def state(request: Request, s: Session = Depends(session)):
        has_pw = bool(store.get(s, "password"))
        token = request.cookies.get(auth.COOKIE)
        return {"setup_needed": not has_pw and not demo_mode,
                "authed": demo_mode or (has_pw and auth.check_token(secret(s), token)),
                "demo_mode": demo_mode, "shop_name": store.get(s, "shop_name"), "business": store.get(s, "business"),
                "owner_name": store.get(s, "owner_name"), "language": store.get(s, "language"),
                "today": store.today(s).isoformat(), "model": forecasts.info()}

    @app.post("/api/setup")
    def setup(body: SetupIn, resp: Response, s: Session = Depends(session)):
        if store.get(s, "password"):
            raise HTTPException(409, "Toko sudah dibuat. Silakan masuk.")
        check_profile(body)
        start = "demo" if body.demo else body.start
        if start == "demo" and body.business not in demo.LOCATION:
            raise HTTPException(422, "Data contoh hanya ada untuk warung makan dan kafe")
        store.put(s, "password", auth.hash_password(body.password))
        if start == "demo":
            demo.load(s, body.business)
        save_profile(s, body)
        if start != "demo":
            if body.catalog_items:
                apply_catalog(s, body.catalog_items, body.catalog_prices)
            for n, it in enumerate(body.own_items):
                if it.category not in store.CATEGORIES:
                    raise HTTPException(422, "Kategori tidak dikenal")
                s.add(MenuItem(name=it.name.strip(), category=it.category, price=it.price, sort=100 + n,
                               batch_cost=it.cost if it.cost else None, batch_qty=1 if it.cost else None))
            store.bump(s)
        s.commit()
        login_cookie(resp, s)
        return {"ok": True}

    @app.post("/api/login")
    def login(body: LoginIn, resp: Response, s: Session = Depends(session)):
        pw = store.get(s, "password")
        if not pw or not auth.check_password(body.password, pw):
            raise HTTPException(401, "Kata sandi salah")
        login_cookie(resp, s)
        return {"ok": True}

    @app.post("/api/reset")
    def reset(body: ResetIn, resp: Response, s: Session = Depends(authed)):
        """Delete everything and start again from the sign-up. A backup is made first when
        backups are on (the laptop app), so this can be undone with Restore."""
        if body.confirm.strip() != store.get(s, "shop_name").strip():
            raise HTTPException(422, "Nama usaha yang diketik tidak sama")
        backup.make(db.engine, label="sebelum-reset-" + store.now(s).strftime("%Y-%m-%d_%H%M%S"))
        from .db import Base
        keep = {k: store.get(s, k) for k in ("today", "timezone") if s.get(Setting, k)}
        for table in reversed(Base.metadata.sorted_tables):
            s.execute(table.delete())
        for k, v in keep.items():
            store.put(s, k, v)
        s.commit()
        resp.delete_cookie(auth.COOKIE)
        return {"ok": True}

    @app.post("/api/logout")
    def logout(resp: Response):
        resp.delete_cookie(auth.COOKIE)
        return {"ok": True}

    def check_profile(body: Profile) -> None:
        if body.business is not None and body.business not in store.BUSINESSES:
            raise HTTPException(422, "Jenis usaha tidak dikenal")
        if body.location is not None and body.location not in store.LOCATIONS:
            raise HTTPException(422, "Lokasi tidak dikenal")
        if body.open_days is not None and (not body.open_days or any(d < 0 or d > 6 for d in body.open_days)):
            raise HTTPException(422, "Pilih minimal satu hari buka")

    def save_profile(s: Session, body: Profile) -> None:
        for k, v in body.model_dump(exclude_none=True, include=set(Profile.model_fields)).items():
            store.put(s, k, ",".join(str(d) for d in sorted(set(v))) if k == "open_days" else str(v))
        store.bump(s)

    @app.get("/api/settings")
    def get_settings(s: Session = Depends(authed)):
        out = {k: store.get(s, k) for k in Profile.model_fields}
        out["open_days"] = sorted(set(range(7)) - store.off_weekdays(s))
        for k in ("cycle_days", "target_revenue"):
            out[k] = int(float(out[k] or 0))
        for k in ("service_level", "target_margin"):
            out[k] = float(out[k] or 0)
        return out

    @app.put("/api/settings")
    def put_settings(body: SettingsIn, s: Session = Depends(authed)):
        check_profile(body)
        save_profile(s, body)
        s.commit()
        return get_settings(s)

    # ---- menu, ingredients, catalog

    def suggested_price(cost: float, margin: float) -> int | None:
        """Price that leaves `margin` of it after ingredients, rounded up to Rp500."""
        if cost <= 0:
            return None
        return int(-(-cost / (1 - margin) // 500) * 500)

    def menu_out(it: MenuItem, margin: float | None = None) -> dict:
        cost = analytics.unit_cost(it)
        return {"id": it.id, "name": it.name, "category": it.category, "price": it.price, "active": it.active,
                "unit_cost": round(cost), "margin": round(1 - cost / it.price, 3) if it.price else None,
                "recipe_cost": round(analytics.recipe_cost(it)), "batch_cost": it.batch_cost, "batch_qty": it.batch_qty,
                "suggested_price": suggested_price(cost, margin) if margin else None,
                "recipe": [{"ingredient_id": r.ingredient_id, "name": r.ingredient.name, "unit": r.ingredient.unit,
                            "amount": r.amount} for r in it.recipe]}

    @app.get("/api/menu")
    def get_menu(all: bool = False, s: Session = Depends(authed)):
        m = float(store.get(s, "target_margin") or 0.6)
        return [menu_out(it, m) for it in store.menu(s, active_only=not all)]

    def save_menu(it: MenuItem, body: MenuIn, s: Session):
        if body.category not in store.CATEGORIES:
            raise HTTPException(422, "Kategori tidak dikenal")
        it.name, it.category, it.price, it.active = body.name, body.category, body.price, body.active
        simple = body.batch_cost is not None and body.batch_qty
        it.batch_cost, it.batch_qty = (body.batch_cost, body.batch_qty) if simple else (None, None)
        it.recipe.clear()
        s.flush()
        seen = set()
        for r in body.recipe:
            if r.ingredient_id in seen or not s.get(Ingredient, r.ingredient_id):
                continue
            seen.add(r.ingredient_id)
            it.recipe.append(RecipeLine(ingredient_id=r.ingredient_id, amount=r.amount))
        store.bump(s)
        s.commit()
        s.refresh(it)
        return menu_out(it, float(store.get(s, "target_margin") or 0.6))

    @app.post("/api/menu", status_code=201)
    def add_menu(body: MenuIn, s: Session = Depends(authed)):
        it = MenuItem(name=body.name, category=body.category, price=body.price)
        s.add(it)
        s.flush()
        return save_menu(it, body, s)

    @app.put("/api/menu/{item_id}")
    def edit_menu(item_id: int, body: MenuIn, s: Session = Depends(authed)):
        it = s.get(MenuItem, item_id)
        if not it:
            raise HTTPException(404, "Menu tidak ada")
        return save_menu(it, body, s)

    def ingredient_out(g: Ingredient, levels: dict[int, float]) -> dict:
        return {"id": g.id, "name": g.name, "unit": g.unit, "cost_per_unit": g.cost_per_unit,
                "shelf_life_days": g.shelf_life_days, "lead_time_days": g.lead_time_days, "pack_size": g.pack_size,
                "pack_name": g.pack_name, "active": g.active, "on_hand": round(levels.get(g.id, 0.0), 1)}

    @app.get("/api/ingredients")
    def get_ingredients(all: bool = False, s: Session = Depends(authed)):
        levels = store.stock_levels(s)
        return [ingredient_out(g, levels) for g in store.ingredients(s, active_only=not all)]

    @app.post("/api/ingredients", status_code=201)
    def add_ingredient(body: IngredientIn, s: Session = Depends(authed)):
        g = Ingredient(**body.model_dump())
        s.add(g)
        store.bump(s)
        s.commit()
        return ingredient_out(g, store.stock_levels(s))

    @app.put("/api/ingredients/{ing_id}")
    def edit_ingredient(ing_id: int, body: IngredientIn, s: Session = Depends(authed)):
        g = s.get(Ingredient, ing_id)
        if not g:
            raise HTTPException(404, "Bahan tidak ada")
        for k, v in body.model_dump().items():
            setattr(g, k, v)
        store.bump(s)
        s.commit()
        return ingredient_out(g, store.stock_levels(s))

    @app.get("/api/catalog")
    def catalog(business: str = "warung_makan"):  # public: the sign-up form shows it
        if business == "kios":
            return {"items": [{"key": g.key, "name": g.name, "category": g.category, "price": g.price,
                               "recipe": [{"ingredient": g.name, "unit": "pcs", "amount": 1}]} for g in kios.GOODS]}
        menu = MENUS.get(business, [])
        return {"items": [{"key": m.key, "name": m.name, "category": m.category, "price": m.price,
                           "recipe": [{"ingredient": INGREDIENTS[k].name, "unit": INGREDIENTS[k].unit, "amount": a}
                                      for k, a in m.recipe.items()]} for m in menu]}

    @app.post("/api/catalog/apply")
    def catalog_apply(body: CatalogApplyIn, s: Session = Depends(authed)):
        added = apply_catalog(s, body.items)
        s.commit()
        return {"added": added}

    def apply_catalog(s: Session, keys: list[str], prices: dict[str, int] | None = None) -> int:
        prices = {k: v for k, v in (prices or {}).items() if isinstance(v, int) and 0 <= v <= 100_000_000}
        all_items = {m.key: m for menu in MENUS.values() for m in menu}
        existing = {g.name: g for g in store.ingredients(s, active_only=False)}
        added = 0
        for key in keys:
            g = kios.BY_KEY.get(key)
            if g:  # a good is its own stock: one sold takes one off the shelf
                it = MenuItem(name=g.name, category=g.category, price=prices.get(key, g.price))
                s.add(it)
                ing = existing.get(g.name)
                if not ing:
                    ing = Ingredient(name=g.name, unit="pcs", cost_per_unit=g.pack_price / g.pack,
                                     shelf_life_days=g.shelf_life_days, lead_time_days=g.lead_time_days,
                                     pack_size=g.pack, pack_name=g.pack_name)
                    s.add(ing)
                    s.flush()
                    existing[g.name] = ing
                s.flush()
                s.add(RecipeLine(item_id=it.id, ingredient_id=ing.id, amount=1))
                added += 1
                continue
            m = all_items.get(key)
            if not m:
                continue
            it = MenuItem(name=m.name, category=m.category, price=prices.get(key, m.price))
            s.add(it)
            s.flush()
            for k, amount in m.recipe.items():
                c = INGREDIENTS[k]
                g = existing.get(c.name)
                if not g:
                    g = Ingredient(name=c.name, unit=c.unit, cost_per_unit=c.cost, shelf_life_days=c.shelf_life_days,
                                   lead_time_days=c.lead_time_days, pack_size=c.pack, pack_name=c.pack_name)
                    s.add(g)
                    s.flush()
                    existing[c.name] = g
                s.add(RecipeLine(item_id=it.id, ingredient_id=g.id, amount=amount))
            added += 1
        store.bump(s)
        return added

    # ---- daily records

    @app.get("/api/sales")
    def get_sales(day: date | None = None, s: Session = Depends(authed)):
        day = day or store.today(s)
        rows = {r.item_id: r for r in s.scalars(select(DailySale).where(DailySale.day == day))}
        st = s.get(DayStatus, day)
        promos = store.promo_days(s, day, day)
        return {"day": day.isoformat(), "closed": bool(st and st.closed), "note": st.note if st else "",
                "recorded": bool(rows),
                "entries": [{"item_id": it.id, "name": it.name, "category": it.category, "price": it.price,
                             "qty": rows[it.id].qty if it.id in rows else 0,
                             "stockout": rows[it.id].stockout if it.id in rows else False,
                             "promo": rows[it.id].promo if it.id in rows else bool(promos.get((it.id, day)))}
                            for it in store.menu(s)]}

    @app.put("/api/sales/{day}")
    def put_sales(day: date, body: DayIn, s: Session = Depends(authed)):
        if day > store.today(s):
            raise HTTPException(422, "Penjualan hanya bisa dicatat sampai hari ini")
        entries = [] if body.closed else [e.model_dump() for e in body.entries]
        if body.closed:
            s.query(DailySale).filter(DailySale.day == day).delete()
        store.record_day(s, day, entries, closed=body.closed, note=body.note)
        s.commit()
        return get_sales(day, s)

    @app.get("/api/days")
    def get_days(start: date, end: date, s: Session = Depends(authed)):
        return [{"day": d.isoformat(), "note": n} for d, n in sorted(store.closed_days(s, start, end, include_off=False).items())]

    @app.put("/api/days/{day}")
    def put_day(day: date, body: ClosureIn, s: Session = Depends(authed)):
        st = s.get(DayStatus, day)
        if body.closed:
            if st:
                st.closed, st.note = True, body.note
            else:
                s.add(DayStatus(day=day, closed=True, note=body.note))
        elif st:
            s.delete(st)
        store.bump(s)
        s.commit()
        return {"ok": True}

    @app.get("/api/promos")
    def get_promos(s: Session = Depends(authed)):
        t = store.today(s)
        rows = s.scalars(select(PromoPlan).where(PromoPlan.end >= t).order_by(PromoPlan.start))
        return [{"id": p.id, "item_id": p.item_id, "start": p.start.isoformat(), "end": p.end.isoformat(),
                 "note": p.note} for p in rows]

    @app.post("/api/promos", status_code=201)
    def add_promo(body: PromoIn, s: Session = Depends(authed)):
        if body.end < body.start:
            raise HTTPException(422, "Tanggal selesai sebelum tanggal mulai")
        s.add(PromoPlan(**body.model_dump()))
        store.bump(s)
        s.commit()
        return {"ok": True}

    @app.delete("/api/promos/{pid}")
    def del_promo(pid: int, s: Session = Depends(authed)):
        p = s.get(PromoPlan, pid)
        if p:
            s.delete(p)
            store.bump(s)
            s.commit()
        return {"ok": True}

    @app.post("/api/stock", status_code=201)
    def add_stock(body: StockIn, s: Session = Depends(authed)):
        if not s.get(Ingredient, body.ingredient_id):
            raise HTTPException(404, "Bahan tidak ada")
        store.add_stock(s, body.day or store.today(s), body.ingredient_id, body.kind, body.qty, body.cost, body.note)
        s.commit()
        return {"on_hand": round(store.stock_levels(s).get(body.ingredient_id, 0.0), 1)}

    @app.get("/api/stock/moves")
    def stock_moves(ingredient_id: int | None = None, limit: int = 50, s: Session = Depends(authed)):
        q = select(StockMove).where(StockMove.auto.is_(False))
        if ingredient_id:
            q = q.where(StockMove.ingredient_id == ingredient_id)
        rows = s.scalars(q.order_by(StockMove.day.desc(), StockMove.id.desc()).limit(min(limit, 500)))
        names = {g.id: (g.name, g.unit) for g in store.ingredients(s, active_only=False)}
        return [{"id": m.id, "day": m.day.isoformat(), "ingredient_id": m.ingredient_id,
                 "ingredient": names.get(m.ingredient_id, ("?", ""))[0], "unit": names.get(m.ingredient_id, ("", ""))[1],
                 "kind": m.kind, "qty": round(m.qty, 1), "cost": round(m.cost), "note": m.note} for m in rows]

    # ---- analytics and forecasts

    @app.get("/api/dashboard")
    def get_dashboard(days: int = 30, s: Session = Depends(authed)):
        out = analytics.dashboard(s, max(7, min(days, 365)))
        out["target"] = summary.target(s, forecasts)
        out["target_margin"] = float(store.get(s, "target_margin") or 0.6)
        return out

    @app.get("/api/summary")
    def get_summary(s: Session = Depends(authed)):
        return summary.week(s, forecasts)

    @app.post("/api/simulate")
    def simulate(body: SimulateIn, s: Session = Depends(authed)):
        if body.sensitivity not in SENSITIVITY:
            raise HTTPException(422, "Pilihan kepekaan harga tidak dikenal")
        promo = None
        if body.promo_start or body.promo_end:
            if not (body.promo_start and body.promo_end) or body.promo_end < body.promo_start:
                raise HTTPException(422, "Tanggal promo tidak valid")
            promo = (body.promo_start, body.promo_end)
        try:
            return scenario(forecasts, s, body.item_id, body.new_price, promo, body.sensitivity)
        except KeyError:
            raise HTTPException(404, "Menu tidak ada atau tidak aktif")

    # ---- till

    def order_out(o: Order, names: dict[int, str]) -> dict:
        return {"id": o.id, "number": o.number, "day": o.day.isoformat(), "time": o.created.strftime("%H:%M"),
                "total": o.total, "method": o.method, "cash": o.cash, "note": o.note, "void": o.void,
                "lines": [{"item_id": ln.item_id, "name": names.get(ln.item_id, "?"), "qty": ln.qty, "price": ln.price}
                          for ln in o.lines]}

    def item_names(s: Session) -> dict[int, str]:
        return {it.id: it.name for it in store.menu(s, active_only=False)}

    @app.post("/api/orders", status_code=201)
    def add_order(body: OrderIn, s: Session = Depends(authed)):
        try:
            o = store.create_order(s, [(ln.item_id, ln.qty) for ln in body.lines], body.method, body.cash, body.note)
        except ValueError:
            raise HTTPException(422, "Pesanan kosong atau menu tidak dijual")
        if body.method == "tunai" and body.cash is not None and body.cash < o.total:
            s.rollback()
            raise HTTPException(422, "Uang yang diterima kurang dari total")
        s.commit()
        return order_out(o, item_names(s))

    @app.get("/api/orders")
    def get_orders(day: date | None = None, limit: int = 50, s: Session = Depends(authed)):
        day = day or store.today(s)
        rows = s.scalars(select(Order).where(Order.day == day).order_by(Order.id.desc()).limit(min(max(limit, 1), 500)))
        names = item_names(s)
        return [order_out(o, names) for o in rows]

    @app.post("/api/orders/{oid}/void")
    def void_order(oid: int, s: Session = Depends(authed)):
        o = s.get(Order, oid)
        if not o:
            raise HTTPException(404, "Orderan tidak ada")
        store.void_order(s, o)
        s.commit()
        return order_out(o, item_names(s))

    @app.get("/api/today")
    def get_today(s: Session = Depends(authed)):
        out = analytics.today_till(s)
        out["last"] = out["last"].strftime("%H:%M") if out["last"] else None
        return out

    # ---- special orders

    def preorder_out(p: PreOrder) -> dict:
        total = sum(ln.qty * ln.price for ln in p.lines)
        return {"id": p.id, "customer": p.customer, "phone": p.phone, "due": p.due.isoformat(), "due_time": p.due_time,
                "status": p.status, "dp": p.dp, "note": p.note, "total": total, "rest": max(0, total - p.dp),
                "lines": [{"item_id": ln.item_id, "name": ln.name, "qty": ln.qty, "price": ln.price} for ln in p.lines]}

    def save_preorder(p: PreOrder, body: PreOrderIn, s: Session) -> dict:
        items = {it.id: it for it in store.menu(s, active_only=False)}
        lines = []
        for ln in body.lines:
            it = items.get(ln.item_id) if ln.item_id else None
            name = it.name if it else ln.name.strip()
            if not name:
                raise HTTPException(422, "Setiap baris pesanan perlu menu atau nama barang")
            lines.append(PreOrderLine(item_id=it.id if it else None, name=name, qty=ln.qty, price=ln.price))
        for k in ("customer", "phone", "due", "due_time", "status", "dp", "note"):
            setattr(p, k, getattr(body, k))
        p.lines.clear()
        s.flush()
        p.lines.extend(lines)
        s.flush()
        store.book_preorder(s, p)
        s.commit()
        s.refresh(p)
        return preorder_out(p)

    @app.get("/api/preorders")
    def get_preorders(when: str = "open", s: Session = Depends(authed)):
        q = select(PreOrder)
        if when == "open":
            q = q.where(PreOrder.status.in_(("baru", "proses"))).order_by(PreOrder.due, PreOrder.due_time)
        else:
            q = q.where(PreOrder.status.in_(("selesai", "batal"))).order_by(PreOrder.due.desc()).limit(100)
        return [preorder_out(p) for p in s.scalars(q)]

    @app.post("/api/preorders", status_code=201)
    def add_preorder(body: PreOrderIn, s: Session = Depends(authed)):
        p = PreOrder(customer=body.customer, due=body.due)
        s.add(p)
        s.flush()
        return save_preorder(p, body, s)

    @app.put("/api/preorders/{pid}")
    def edit_preorder(pid: int, body: PreOrderIn, s: Session = Depends(authed)):
        p = s.get(PreOrder, pid)
        if not p:
            raise HTTPException(404, "Pesanan tidak ada")
        return save_preorder(p, body, s)

    @app.post("/api/preorders/{pid}/status")
    def preorder_status(pid: int, body: StatusIn, s: Session = Depends(authed)):
        p = s.get(PreOrder, pid)
        if not p:
            raise HTTPException(404, "Pesanan tidak ada")
        p.status = body.status
        store.book_preorder(s, p)
        s.commit()
        return preorder_out(p)

    @app.delete("/api/preorders/{pid}")
    def del_preorder(pid: int, s: Session = Depends(authed)):
        p = s.get(PreOrder, pid)
        if p:
            p.status = "batal"
            store.book_preorder(s, p)
            s.delete(p)
            s.commit()
        return {"ok": True}

    # ---- notes board

    def note_out(n: Note) -> dict:
        return {"id": n.id, "text": n.text, "pinned": n.pinned, "updated": n.updated.isoformat(timespec="minutes")}

    @app.get("/api/notes")
    def get_notes(s: Session = Depends(authed)):
        return [note_out(n) for n in s.scalars(select(Note).order_by(Note.pinned.desc(), Note.updated.desc()))]

    @app.post("/api/notes", status_code=201)
    def add_note(body: NoteIn, s: Session = Depends(authed)):
        n = Note(text=body.text, pinned=body.pinned, updated=store.now(s))
        s.add(n)
        s.commit()
        return note_out(n)

    @app.put("/api/notes/{nid}")
    def edit_note(nid: int, body: NoteIn, s: Session = Depends(authed)):
        n = s.get(Note, nid)
        if not n:
            raise HTTPException(404, "Catatan tidak ada")
        n.text, n.pinned, n.updated = body.text, body.pinned, store.now(s)
        s.commit()
        return note_out(n)

    @app.delete("/api/notes/{nid}")
    def del_note(nid: int, s: Session = Depends(authed)):
        n = s.get(Note, nid)
        if n:
            s.delete(n)
            s.commit()
        return {"ok": True}

    # ---- backups (laptop install)

    @app.get("/api/backup")
    def backup_status(_: Session = Depends(authed)):
        return backup.status(db.engine)

    @app.post("/api/backup")
    def backup_now(_: Session = Depends(authed)):
        made = backup.make(db.engine)
        if not made:
            raise HTTPException(409, "Cadangan otomatis tidak aktif di pemasangan ini")
        return {**backup.status(db.engine), "made": [str(p) for p in made]}

    # ---- expenses

    def expense_out(e: Expense) -> dict:
        return {"id": e.id, "day": e.day.isoformat(), "category": e.category, "amount": round(e.amount), "note": e.note}

    @app.get("/api/expenses")
    def get_expenses(start: date | None = None, end: date | None = None, s: Session = Depends(authed)):
        end = end or store.today(s)
        start = start or end - timedelta(days=30)
        rows = s.scalars(select(Expense).where(Expense.day >= start, Expense.day <= end)
                         .order_by(Expense.day.desc(), Expense.id.desc()))
        return [expense_out(e) for e in rows]

    @app.post("/api/expenses", status_code=201)
    def add_expense(body: ExpenseIn, s: Session = Depends(authed)):
        if body.category not in store.EXPENSE_CATEGORIES:
            raise HTTPException(422, "Jenis pengeluaran tidak dikenal")
        if body.day > store.today(s):
            raise HTTPException(422, "Pengeluaran hanya bisa dicatat sampai hari ini")
        e = Expense(**body.model_dump())
        s.add(e)
        s.commit()
        return expense_out(e)

    @app.delete("/api/expenses/{eid}")
    def del_expense(eid: int, s: Session = Depends(authed)):
        e = s.get(Expense, eid)
        if e:
            s.delete(e)
            s.commit()
        return {"ok": True}

    @app.get("/api/forecast")
    def get_forecast(s: Session = Depends(authed)):
        res = forecasts.compute(s)
        from laris_ml import plan as P
        prices = np.array([x.price for x in res.items], dtype=float)
        tot = P.totals(res.paths, prices) if res.items else {"portions": np.zeros((F.HORIZON, 3)),
                                                              "revenue": np.zeros((F.HORIZON, 3))}
        week = res.paths[..., :7].sum(-1) if res.items else None
        return {
            "start": res.start.isoformat(), "dates": [d.isoformat() for d in res.dates], "method": res.method,
            "note": res.note, "closed": res.closed, "weekly_off": res.weekly_off,
            "totals": {k: [[round(float(x)) for x in row] for row in v] for k, v in tot.items()},
            "items": [{"id": x.item_id, "name": x.name, "category": x.category, "price": x.price,
                       "history_days": x.history_days,
                       "p10": [round(float(v), 1) for v in x.quantiles[:, Q10]],
                       "p50": [round(float(v), 1) for v in x.quantiles[:, Q50]],
                       "p90": [round(float(v), 1) for v in x.quantiles[:, Q90]],
                       "week": [round(float(np.quantile(week[:, i], q))) for q in (0.1, 0.5, 0.9)]}
                      for i, x in enumerate(res.items)],
            "backtest": forecasts.backtest(s),
        }

    @app.get("/api/plan")
    def get_plan(s: Session = Depends(authed)):
        res = forecasts.compute(s)
        if not res.items:
            return {"items": [], "total_cost": 0, "cycle_days": int(store.get(s, "cycle_days") or 1)}
        lst = forecasts.shopping(s, res)
        return {"start": res.start.isoformat(), "cycle_days": int(store.get(s, "cycle_days") or 1),
                "service_level": float(store.get(s, "service_level") or 0.9), "method": res.method,
                "total_cost": round(sum(p.cost for p in lst)),
                "items": [{"id": int(p.id), "name": p.name, "unit": p.unit, "on_hand": round(p.on_hand, 1),
                           "daily": round(p.daily_p50, 1), "need": round(p.need_p50, 1),
                           "need_target": round(p.need_target, 1), "buy": round(p.buy, 1), "packs": p.packs,
                           "pack_name": next((g.pack_name for g in store.ingredients(s) if g.id == int(p.id)), ""),
                           "cost": round(p.cost),
                           "days_left": None if p.days_left == float("inf") else round(p.days_left, 1),
                           "risk": round(p.stockout_risk, 2), "capped": p.capped_by_shelf_life, "reason": p.reason}
                          for p in lst]}

    @app.post("/api/demo")
    def load_demo(body: DemoIn, s: Session = Depends(authed)):
        if body.business not in demo.LOCATION:
            raise HTTPException(422, "Data contoh hanya ada untuk warung makan dan kafe")
        return demo.load(s, body.business)

    @app.get("/api/export/sales.csv")
    def export_sales(s: Session = Depends(authed)):
        items = {it.id: it for it in store.menu(s, active_only=False)}
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["tanggal", "menu", "kategori", "harga", "terjual", "habis", "promo", "omzet"])
        for r in s.scalars(select(DailySale).order_by(DailySale.day, DailySale.item_id)):
            it = items.get(r.item_id)
            if it:
                w.writerow([r.day.isoformat(), it.name, it.category, it.price, r.qty, int(r.stockout), int(r.promo),
                            r.qty * it.price])
        buf.seek(0)
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                                 headers={"Content-Disposition": "attachment; filename=laris-penjualan.csv"})

    # ---- the web app

    static = Path(static_dir or os.environ.get("LARIS_STATIC_DIR") or Path(__file__).resolve().parents[2] / "frontend" / "dist")
    if (static / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            f = static / path
            if path and f.is_file() and static in f.resolve().parents:
                return FileResponse(f)
            return FileResponse(static / "index.html")

    return app


app = create_app() if os.environ.get("LARIS_NO_AUTOAPP") != "1" else None
