"""Forecasts for the shop's menu, the shop totals, and the shopping list.

Results are cached per data version, so the dashboard does not rerun the model on every request.
Without a model file (or with very little history) it falls back to the weekday-average rule and
says so.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from laris_ml import calendar_id as cal, features as F, plan
from laris_ml.baselines import weekday_average

from . import store
from .models import MenuItem

MIN_DAYS = 7


def default_model_dir() -> Path:
    env = os.environ.get("LARIS_MODEL_DIR")
    if env:
        return Path(env)
    here = Path(__file__).resolve()
    for p in [here.parents[2] / "models" / "larisnet", Path("/app/models/larisnet")]:
        if (p / "model.onnx").exists():
            return p
    return here.parents[2] / "models" / "larisnet"


@dataclass
class ItemForecast:
    item_id: int
    name: str
    category: str
    price: int
    quantiles: np.ndarray  # (HORIZON, Q)
    history_days: int


@dataclass
class Result:
    start: date
    dates: list[date]
    items: list[ItemForecast]
    method: str               # "larisnet" or "rata-rata hari yang sama"
    note: str
    closed: list[bool]
    weekly_off: list[int] = field(default_factory=list)  # 0 = Monday
    paths: np.ndarray | None = field(default=None, repr=False)


class Forecasts:
    def __init__(self, model_dir: Path | None = None):
        self.model_dir = Path(model_dir) if model_dir else default_model_dir()
        self._model = None
        self._cache: dict[tuple, Result] = {}
        self._lock = threading.Lock()

    @property
    def model(self):
        if self._model is None and (self.model_dir / "model.onnx").exists():
            from laris_ml.forecast import Forecaster
            self._model = Forecaster(self.model_dir)
        return self._model

    def info(self) -> dict:
        m = self.model
        return {"available": m is not None, **({k: m.meta[k] for k in ("name", "version", "params", "train_series")
                                                 if k in m.meta} if m else {})}

    # ------------------------------------------------------------------ inputs

    def windows(self, s: Session, start: date, items: list[MenuItem],
                extra_promos: dict | None = None) -> tuple[list[F.Window], list[int], list[bool]]:
        business = store.get(s, "business")
        hist_start = start - timedelta(days=F.CONTEXT)
        hist_end = start - timedelta(days=1)
        fut_end = start + timedelta(days=F.HORIZON - 1)
        sales = {(r.item_id, r.day): r for r in store.sales_frame(s, hist_start, hist_end)}
        closed = store.closed_days(s, hist_start, fut_end)
        recorded = store.recorded_days(s, hist_start, hist_end)
        promos = store.promo_days(s, hist_start, fut_end)
        promos.update(extra_promos or {})
        past_dates = pd.date_range(hist_start, hist_end, freq="D")
        fut_dates = pd.date_range(start, fut_end, freq="D")
        past_cal, fut_cal = cal.table(past_dates), cal.table(fut_dates)
        # a regular day off (closed on that weekday for the last 6 weeks) counts as planned
        weekly_off = {wd for wd in range(7)
                      if all((start - timedelta(days=k)) in closed
                             for k in range(1, 43) if (start - timedelta(days=k)).weekday() == wd)}
        weekly_off |= store.off_weekdays(s)
        self.weekly_off = sorted(weekly_off)
        fut_closed = np.array([d.date() in closed or d.weekday() in weekly_off for d in fut_dates], dtype=np.float32)
        windows, n_hist = [], []
        for it in items:
            first = it.created.date() if it.created else hist_start
            # observed days: recorded or closed, on or after the item was added (or its first sale)
            first_sale = min((d for (i, d) in sales if i == it.id), default=None)
            begin = min(first, first_sale) if first_sale else first
            keep = [k for k, d in enumerate(past_dates) if d.date() >= begin
                    and (d.date() in recorded or d.date() in closed)]
            # history must be contiguous at the end for the model: take the run of days up to yesterday
            run = []
            for k in reversed(range(len(past_dates))):
                if k in keep:
                    run.append(k)
                else:
                    break
            run = list(reversed(run))
            qty = np.array([sales[(it.id, past_dates[k].date())].qty if (it.id, past_dates[k].date()) in sales else 0
                            for k in run], dtype=np.float32)
            cl = np.array([past_dates[k].date() in closed for k in run], dtype=np.float32)
            so = np.array([bool(sales.get((it.id, past_dates[k].date())) and sales[(it.id, past_dates[k].date())].stockout)
                           for k in run], dtype=np.float32)
            pr = np.array([bool((sales.get((it.id, past_dates[k].date())) and sales[(it.id, past_dates[k].date())].promo)
                                or promos.get((it.id, past_dates[k].date()))) for k in run], dtype=np.float32)
            fpr = np.array([promos.get((it.id, d.date()), False) for d in fut_dates], dtype=np.float32)
            windows.append(F.build(qty, cl, so, pr, past_cal[run], fut_cal, fut_closed, fpr, it.category, business))
            n_hist.append(len(run))
        return windows, n_hist, [bool(x) for x in fut_closed]

    # ------------------------------------------------------------------ main

    def compute(self, s: Session, start: date | None = None) -> Result:
        start = start or store.today(s)
        key = (store.get(s, "data_version"), start, str(self.model_dir))
        with self._lock:
            if key in self._cache:
                return self._cache[key]
        items = store.menu(s)
        dates = [start + timedelta(days=i) for i in range(F.HORIZON)]
        if not items:
            return Result(start, dates, [], "none", "Belum ada menu.", [False] * F.HORIZON)
        windows, n_hist, fut_closed = self.windows(s, start, items)
        enough = [n >= MIN_DAYS for n in n_hist]
        model = self.model
        if model is not None and any(enough):
            q = model.predict(windows)
            method, note = "larisnet", ""
        else:
            method = "rata-rata hari yang sama"
            note = ("Model belum tersedia, " if model is None else "") + "prediksi memakai rata-rata hari yang sama."
            q = None
        b = F.stack(windows)
        fallback = weekday_average(b, F.QUANTILES)
        out = []
        for i, it in enumerate(items):
            qi = q[i] if (q is not None and enough[i]) else fallback[i]
            if not enough[i]:
                qi = np.zeros_like(qi) if n_hist[i] == 0 else qi
            out.append(ItemForecast(it.id, it.name, it.category, it.price, qi, n_hist[i]))
        if method == "larisnet" and not all(enough):
            note = "Menu dengan data kurang dari 7 hari diprediksi dari rata-rata yang ada."
        qs = np.stack([x.quantiles for x in out])
        res = Result(start, dates, out, method, note, fut_closed, getattr(self, "weekly_off", []),
                     plan.sample_paths(qs, n=800, seed=start.toordinal()))
        with self._lock:
            if len(self._cache) > 32:
                self._cache.clear()
            self._cache[key] = res
        return res

    def shopping(self, s: Session, res: Result) -> list[plan.Purchase]:
        items = {it.id: it for it in store.menu(s)}
        ids = [str(x.item_id) for x in res.items]
        recipes = {str(x.item_id): {str(r.ingredient_id): r.amount for r in items[x.item_id].recipe} for x in res.items}
        levels = store.stock_levels(s)
        infos = {str(g.id): plan.IngredientInfo(str(g.id), g.name, g.unit, max(levels.get(g.id, 0.0), 0.0),
                                                g.shelf_life_days, g.lead_time_days, g.pack_size, g.pack_name,
                                                g.cost_per_unit) for g in store.ingredients(s)}
        return plan.shopping_list(res.paths, ids, recipes, infos, cycle_days=int(store.get(s, "cycle_days") or 1),
                                  service=float(store.get(s, "service_level") or 0.9))

    def backtest(self, s: Session, days_ago: int = 28) -> dict | None:
        """How good was the forecast made `days_ago` days ago, against what was then sold."""
        t = store.today(s)
        start = t - timedelta(days=days_ago)
        res = self.compute(s, start)
        if not res.items:
            return None
        actual = {(r.item_id, r.day): r.qty for r in store.sales_frame(s, start, t - timedelta(days=1))}
        recorded = store.recorded_days(s, start, t - timedelta(days=1))
        closed = store.closed_days(s, start, t - timedelta(days=1))
        err = tot = n = 0.0
        for x in res.items:
            if x.history_days < MIN_DAYS:
                continue
            for k, d in enumerate(res.dates[:days_ago]):
                if d in recorded and d not in closed:
                    y = actual.get((x.item_id, d), 0)
                    err += abs(y - x.quantiles[k, F.QUANTILES.index(0.5)])
                    tot += y
                    n += 1
        if n == 0 or tot == 0:
            return None
        return {"days": days_ago, "mae": round(float(err / n), 2), "accuracy": round(float(max(0.0, 1 - err / tot)), 3),
                "method": res.method}


# How much demand moves when the price moves (price elasticity). Laris has no price changes in its
# training data, so these are rough, stated assumptions the owner picks, not something learned.
SENSITIVITY = {"rendah": -0.6, "sedang": -1.2, "tinggi": -2.0}


def scenario(fc: Forecasts, s: Session, item_id: int, new_price: int | None = None,
             promo: tuple[date, date] | None = None, sensitivity: str = "sedang", days: int = F.HORIZON) -> dict:
    """Compare the next `days` days as forecast now with a what-if: a new price for one item,
    and/or a promotion on it. The promotion effect comes from the model; the price effect from
    the chosen sensitivity."""
    base = fc.compute(s)
    ids = [x.item_id for x in base.items]
    if item_id not in ids:
        raise KeyError(item_id)
    i = ids.index(item_id)
    items = {it.id: it for it in store.menu(s)}
    from .analytics import unit_cost
    price = np.array([x.price for x in base.items], dtype=float)
    cost = np.array([unit_cost(items[x]) for x in ids], dtype=float)
    qs = np.stack([x.quantiles for x in base.items])
    promo_note = None
    if promo:
        p0, p1 = promo
        extra = {}
        d = max(p0, base.start)
        while d <= min(p1, base.dates[-1]):
            extra[(item_id, d)] = True
            d += timedelta(days=1)
        if fc.model is not None and base.method == "larisnet" and base.items[i].history_days >= MIN_DAYS:
            w, _, _ = fc.windows(s, base.start, [items[item_id]], extra_promos=extra)
            qs = qs.copy()
            qs[i] = fc.model.predict(w)[0]
        else:
            promo_note = "no_model"
    paths = plan.sample_paths(qs, n=800, seed=base.start.toordinal())
    new_p = price.copy()
    if new_price is not None and new_price > 0 and price[i] > 0:
        e = SENSITIVITY.get(sensitivity, -1.2)
        paths = paths.copy()
        paths[:, i, :] *= (new_price / price[i]) ** e
        new_p[i] = new_price
    n = min(days, F.HORIZON)

    def summarize(pp, pr):
        rev = (pp[..., :n] * pr[None, :, None]).sum(axis=(1, 2))
        gross = (pp[..., :n] * (pr - cost)[None, :, None]).sum(axis=(1, 2))
        qty = pp[:, i, :n].sum(axis=1)
        q = lambda a: [round(float(np.quantile(a, x))) for x in (0.1, 0.5, 0.9)]
        return {"revenue": q(rev), "gross": q(gross), "item_qty": q(qty),
                "item_revenue": round(float(np.median(qty)) * pr[i]),
                "item_gross": round(float(np.median(qty)) * (pr[i] - cost[i]))}

    return {"days": n, "item": {"id": item_id, "name": base.items[i].name, "price": int(price[i]),
                                "unit_cost": round(float(cost[i]))},
            "new_price": int(new_p[i]), "sensitivity": sensitivity, "elasticity": SENSITIVITY.get(sensitivity, -1.2),
            "method": base.method, "promo_note": promo_note,
            "base": summarize(base.paths, price), "what_if": summarize(paths, new_p)}
