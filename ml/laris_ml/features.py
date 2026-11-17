"""Turn one item's sales history into model inputs. Shared by training, evaluation and the app,
so the app (numpy + onnxruntime only) feeds the model exactly what it was trained on.

Per past day:   sales / scale, closed, stockout, promo, observed, calendar features
Per future day: closed (planned), promo (planned), calendar features
Per series:     item category, business type, log of the scale

Sales are divided by the item's average on open days in the context window, so one model serves
an item selling 3 a day and one selling 300. The model predicts quantiles of the scaled sales.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import calendar_id as cal
from .catalog import BUSINESS_TYPES, CATEGORIES

CONTEXT = 56   # days of history the model looks at
HORIZON = 28   # days ahead it predicts
QUANTILES = (0.1, 0.25, 0.5, 0.75, 0.9, 0.95)

N_CAL = len(cal.FEATURES)
PAST_DIM = 5 + N_CAL
FUTURE_DIM = 2 + N_CAL
STATIC_DIM = len(CATEGORIES) + len(BUSINESS_TYPES) + 1


@dataclass
class Window:
    past: np.ndarray     # (CONTEXT, PAST_DIM)
    future: np.ndarray   # (HORIZON, FUTURE_DIM)
    static: np.ndarray   # (STATIC_DIM,)
    mask: np.ndarray     # (CONTEXT,) True where a past day is padding
    scale: float


def scale_of(qty: np.ndarray, closed: np.ndarray, stockout: np.ndarray | None = None) -> float:
    ok = ~closed.astype(bool)
    if stockout is not None:
        ok &= ~stockout.astype(bool)
    if ok.sum() == 0:
        return 1.0
    return float(max(qty[ok].mean(), 0.5))


def static_vec(category: str, business: str, scale: float) -> np.ndarray:
    v = np.zeros(STATIC_DIM, dtype=np.float32)
    v[CATEGORIES.index(category)] = 1
    v[len(CATEGORIES) + BUSINESS_TYPES.index(business)] = 1
    v[-1] = np.log1p(scale) / 5
    return v


def build(qty: np.ndarray, closed: np.ndarray, stockout: np.ndarray, promo: np.ndarray,
          past_cal: np.ndarray, future_cal: np.ndarray, future_closed: np.ndarray, future_promo: np.ndarray,
          category: str, business: str) -> Window:
    """Arrays for one forecast. History may be shorter than CONTEXT (new item): it is left-padded."""
    qty = np.asarray(qty, dtype=np.float32)[-CONTEXT:]
    closed = np.asarray(closed, dtype=np.float32)[-CONTEXT:]
    stockout = np.asarray(stockout, dtype=np.float32)[-CONTEXT:]
    promo = np.asarray(promo, dtype=np.float32)[-CONTEXT:]
    past_cal = np.asarray(past_cal, dtype=np.float32)[-CONTEXT:]
    n = len(qty)
    scale = scale_of(qty, closed, stockout)
    past = np.zeros((CONTEXT, PAST_DIM), dtype=np.float32)
    mask = np.ones(CONTEXT, dtype=bool)
    if n:
        past[-n:, 0] = qty / scale
        past[-n:, 1] = closed
        past[-n:, 2] = stockout
        past[-n:, 3] = promo
        past[-n:, 4] = 1.0
        past[-n:, 5:] = past_cal
        mask[-n:] = False
    future = np.zeros((HORIZON, FUTURE_DIM), dtype=np.float32)
    future[:, 0] = np.asarray(future_closed, dtype=np.float32)[:HORIZON]
    future[:, 1] = np.asarray(future_promo, dtype=np.float32)[:HORIZON]
    future[:, 2:] = np.asarray(future_cal, dtype=np.float32)[:HORIZON]
    return Window(past, future, static_vec(category, business, scale), mask, scale)


def from_history(history: pd.DataFrame, start: pd.Timestamp, category: str, business: str,
                 future_closed: np.ndarray | None = None, future_promo: np.ndarray | None = None) -> Window:
    """history: one row per day up to the day before `start`, columns date, qty, closed, stockout, promo."""
    h = history.sort_values("date").tail(CONTEXT)
    fut_dates = pd.date_range(start, periods=HORIZON, freq="D")
    return build(
        h["qty"].to_numpy(), h["closed"].to_numpy(), h["stockout"].to_numpy(), h["promo"].to_numpy(),
        cal.table(pd.DatetimeIndex(h["date"])), cal.table(fut_dates),
        np.zeros(HORIZON) if future_closed is None else future_closed,
        np.zeros(HORIZON) if future_promo is None else future_promo,
        category, business,
    )


def stack(windows: list[Window]) -> dict[str, np.ndarray]:
    return {
        "past": np.stack([w.past for w in windows]),
        "future": np.stack([w.future for w in windows]),
        "static": np.stack([w.static for w in windows]),
        "mask": np.stack([w.mask for w in windows]),
        "scale": np.array([w.scale for w in windows], dtype=np.float32),
    }
