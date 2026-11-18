"""From menu forecasts to a shopping list.

The model gives quantiles per menu item per day. To know how much ayam, beras or susu to buy we
need the distribution of *sums* over several items and days, which quantiles alone don't give.
So we draw joint scenarios: each item's daily sales are sampled from its forecast quantiles,
with a shared "busy or quiet" shock per day (all items move together when the street is busy)
and a per-item shock (an item that sells well today tends to sell well tomorrow). Summing the
recipes over each scenario gives the ingredient demand distribution.

For each ingredient the order covers the time until the delivery after next arrives:
    lead time + days until the next shopping trip
and the target is the chosen service level (by default, enough in 90% of scenarios). Perishable
ingredients are capped at what is likely to be used before they spoil.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .features import QUANTILES


def _phi(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-1.702 * z))  # logistic approximation of the normal CDF


def sample_paths(q: np.ndarray, n: int = 1000, seed: int = 0, rho_day: float = 0.3, rho_item: float = 0.3,
                 qs: tuple[float, ...] = QUANTILES) -> np.ndarray:
    """q (items, days, Q) quantiles -> (n, items, days) sampled sales, correlated as described above."""
    rng = np.random.default_rng(seed)
    items, days, _ = q.shape
    z = (math.sqrt(rho_day) * rng.standard_normal((n, 1, days))
         + math.sqrt(rho_item) * rng.standard_normal((n, items, 1))
         + math.sqrt(1 - rho_day - rho_item) * rng.standard_normal((n, items, days)))
    u = _phi(z)
    # piecewise-linear quantile function: 0 at p=0, the model's quantiles, and a tail beyond the top one
    probs = np.array((0.0, *qs, 1.0))
    top_slope = (q[..., -1] - q[..., -2]) / (qs[-1] - qs[-2])
    full = np.concatenate([np.zeros(q.shape[:2] + (1,)), q, (q[..., -1] + top_slope * (1 - qs[-1]) * 2)[..., None]], -1)
    k = np.clip(np.searchsorted(probs, u, side="right") - 1, 0, len(probs) - 2)
    lo_p, hi_p = probs[k], probs[k + 1]
    ii = np.arange(items)[None, :, None]
    dd = np.arange(days)[None, None, :]
    lo_v = full[ii, dd, k]
    hi_v = full[ii, dd, k + 1]
    t = (u - lo_p) / np.maximum(hi_p - lo_p, 1e-9)
    return lo_v + t * (hi_v - lo_v)


@dataclass
class IngredientInfo:
    id: str
    name: str
    unit: str
    on_hand: float
    shelf_life_days: int
    lead_time_days: int
    pack: float
    pack_name: str
    cost_per_unit: float
    on_order: float = 0.0


@dataclass
class Purchase:
    id: str
    name: str
    unit: str
    on_hand: float
    daily_p50: float           # typical use per day over the period
    need_p50: float            # use until the next delivery arrives
    need_target: float         # same, at the service level
    buy: float                 # units to buy now (after rounding to packs, 0 if none)
    packs: int
    cost: float
    days_left: float           # how long current stock lasts at typical use
    stockout_risk: float       # chance current stock runs out before a delivery could arrive
    capped_by_shelf_life: bool
    reason: str


def ingredient_paths(paths: np.ndarray, item_ids: list[str], recipes: dict[str, dict[str, float]]
                     ) -> tuple[list[str], np.ndarray]:
    """(n, items, days) sales -> ingredient ids and (n, ingredients, days) usage."""
    ing_ids = sorted({i for r in recipes.values() for i in r})
    m = np.zeros((len(item_ids), len(ing_ids)))
    for a, it in enumerate(item_ids):
        for ing, amount in recipes.get(it, {}).items():
            m[a, ing_ids.index(ing)] = amount
    return ing_ids, np.einsum("nid,ig->ngd", paths, m)


def shopping_list(paths: np.ndarray, item_ids: list[str], recipes: dict[str, dict[str, float]],
                  ingredients: dict[str, IngredientInfo], cycle_days: int = 1, service: float = 0.9,
                  extra: dict[str, np.ndarray] | None = None) -> list[Purchase]:
    """extra: known use per ingredient per day on top of the forecast (for example confirmed
    special orders), as arrays of length horizon."""
    ing_ids, use = ingredient_paths(paths, item_ids, recipes)
    horizon = use.shape[-1]
    if extra:
        new = [i for i in sorted(extra) if i not in ing_ids]
        if new:
            use = np.concatenate([use, np.zeros((use.shape[0], len(new), horizon))], axis=1)
            ing_ids = ing_ids + new
        use = use.copy()
        for iid, add in extra.items():
            use[:, ing_ids.index(iid), :] += np.asarray(add, dtype=float)[:horizon]
    out = []
    for g, iid in enumerate(ing_ids):
        info = ingredients.get(iid)
        if info is None:
            continue
        u = use[:, g, :]
        lead = min(info.lead_time_days, horizon - 1)
        cover = min(lead + max(cycle_days, 1), horizon)
        need = u[:, :cover].sum(1)
        until_arrival = u[:, :max(lead, 1)].sum(1)
        need_p50, need_target = float(np.median(need)), float(np.quantile(need, service))
        daily = float(np.median(u[:, :cover].mean(1)))
        stock = info.on_hand + info.on_order
        days_left = float("inf") if daily <= 0 else info.on_hand / daily
        risk = float((until_arrival > info.on_hand).mean())
        want = max(0.0, need_target - stock)
        capped = False
        if info.shelf_life_days < horizon:
            usable = float(np.median(u[:, lead:lead + info.shelf_life_days].sum(1)))
            left_at_arrival = max(0.0, info.on_hand - float(np.median(until_arrival)))
            limit = max(0.0, usable - left_at_arrival)
            if want > limit:
                want, capped = limit, True
        packs = 0
        buy = 0.0
        if want > 1e-9:
            packs = math.ceil(want / info.pack - 1e-9)
            # a whole pack of something that spoils fast may be too much: buy loose instead
            if capped and packs * info.pack > want * 1.5 and info.pack > want:
                packs, buy = 0, float(math.ceil(want))
            else:
                buy = packs * info.pack
        cost = buy * info.cost_per_unit
        if buy == 0:
            reason = "Stok cukup sampai belanja berikutnya."
        elif capped:
            reason = f"Cepat basi ({info.shelf_life_days} hari): beli secukupnya untuk dipakai sebelum rusak."
        elif risk >= 0.5:
            reason = "Hampir pasti habis sebelum barang baru datang."
        else:
            reason = f"Supaya cukup di {int(service * 100)}% kemungkinan sampai belanja berikutnya."
        out.append(Purchase(iid, info.name, info.unit, info.on_hand, daily, need_p50, need_target, buy, packs,
                            cost, days_left, risk, capped, reason))
    out.sort(key=lambda p: (p.buy == 0, -p.stockout_risk, -p.cost))
    return out


def totals(paths: np.ndarray, prices: np.ndarray, qs: tuple[float, ...] = (0.1, 0.5, 0.9)) -> dict[str, np.ndarray]:
    """Shop-level daily portions and revenue quantiles: {'portions': (days, len(qs)), 'revenue': ...}."""
    portions = paths.sum(1)
    revenue = np.einsum("nid,i->nd", paths, prices)
    return {"portions": np.quantile(portions, qs, axis=0).T, "revenue": np.quantile(revenue, qs, axis=0).T}
