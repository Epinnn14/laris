"""Fast random windows from many series, for training.

All series are laid end to end in flat arrays, each preceded by CONTEXT empty days, so a window is
a slice and a batch is one fancy-indexing gather. Calendar features are looked up from a shared
table by date index, which keeps memory small for thousands of series.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import calendar_id as cal
from .catalog import BUSINESS_TYPES, CATEGORIES
from .features import CONTEXT, FUTURE_DIM, HORIZON, PAST_DIM, STATIC_DIM
from .synth import Shop


@dataclass
class Store:
    y: np.ndarray          # float32 sales
    closed: np.ndarray     # float32
    stockout: np.ndarray   # float32
    promo: np.ndarray      # float32
    observed: np.ndarray   # float32, 0 on padding
    day: np.ndarray        # int32 index into cal_table
    cal_table: np.ndarray  # (days, N_CAL)
    starts: np.ndarray     # first real day of each series (flat index)
    ends: np.ndarray       # one past the last day
    category: np.ndarray   # int per series
    business: np.ndarray   # int per series
    keys: list[str]

    @classmethod
    def from_shops(cls, shops: list[Shop]) -> "Store":
        series = [s for sh in shops for s in sh.series if len(s.qty) > HORIZON + 7]
        first = min(s.dates[0] for s in series)
        last = max(s.dates[-1] for s in series)
        all_days = pd.date_range(first, last, freq="D")
        cal_table = np.vstack([np.zeros((1, len(cal.FEATURES)), np.float32), cal.table(all_days)])
        total = sum(len(s.qty) + CONTEXT for s in series)
        y, closed, stockout, promo, observed = (np.zeros(total, np.float32) for _ in range(5))
        day = np.zeros(total, np.int32)
        starts, ends, category, business = [], [], [], []
        pos = 0
        for s in series:
            pos += CONTEXT
            n = len(s.qty)
            sl = slice(pos, pos + n)
            y[sl], closed[sl], stockout[sl], promo[sl] = s.qty, s.closed, s.stockout, s.promo
            observed[sl] = 1
            day[sl] = (s.dates - first).days.values + 1
            starts.append(pos)
            ends.append(pos + n)
            category.append(CATEGORIES.index(s.item.category))
            business.append(BUSINESS_TYPES.index(s.business))
            pos += n
        return cls(y, closed, stockout, promo, observed, day, cal_table, np.array(starts), np.array(ends),
                   np.array(category), np.array(business), [s.key for s in series])

    def __len__(self) -> int:
        return len(self.starts)

    def origins(self, min_history: int = 7) -> tuple[np.ndarray, np.ndarray]:
        """Every valid (series, origin) pair, for weighting the sampler."""
        lo = self.starts + min_history
        hi = self.ends - HORIZON
        return lo, hi

    def batch(self, rng: np.random.Generator, size: int, min_history: int = 7,
              short_history_p: float = 0.2) -> dict[str, np.ndarray]:
        lo, hi = self.origins(min_history)
        span = np.maximum(hi - lo + 1, 0)
        sid = rng.choice(len(self), size, p=span / span.sum())
        origin = lo[sid] + (rng.random(size) * span[sid]).astype(np.int64)
        return self.gather(sid, origin, rng, short_history_p, min_history)

    def gather(self, sid: np.ndarray, origin: np.ndarray, rng: np.random.Generator | None = None,
               short_history_p: float = 0.0, min_history: int = 7) -> dict[str, np.ndarray]:
        b = len(sid)
        pidx = origin[:, None] + np.arange(-CONTEXT, 0)[None]
        fidx = origin[:, None] + np.arange(HORIZON)[None]
        obs = self.observed[pidx].copy()
        if rng is not None and short_history_p > 0:
            # pretend some items are new: hide all but the last k days
            short = rng.random(b) < short_history_p
            k = rng.integers(min_history, CONTEXT, b)
            hide = short[:, None] & (np.arange(CONTEXT)[None] < (CONTEXT - k)[:, None])
            obs[hide] = 0
        y = self.y[pidx] * obs
        closed = self.closed[pidx] * obs
        stock = self.stockout[pidx] * obs
        ok = obs * (1 - closed) * (1 - stock)
        scale = np.maximum((y * ok).sum(1) / np.maximum(ok.sum(1), 1), 0.5).astype(np.float32)
        scale = np.where(ok.sum(1) > 0, scale, 1.0).astype(np.float32)
        past = np.zeros((b, CONTEXT, PAST_DIM), np.float32)
        past[..., 0] = y / scale[:, None]
        past[..., 1] = closed
        past[..., 2] = stock
        past[..., 3] = self.promo[pidx] * obs
        past[..., 4] = obs
        past[..., 5:] = self.cal_table[self.day[pidx]] * obs[..., None]
        future = np.zeros((b, HORIZON, FUTURE_DIM), np.float32)
        future[..., 0] = self.closed[fidx]
        future[..., 1] = self.promo[fidx]
        future[..., 2:] = self.cal_table[self.day[fidx]]
        static = np.zeros((b, STATIC_DIM), np.float32)
        static[np.arange(b), self.category[sid]] = 1
        static[np.arange(b), len(CATEGORIES) + self.business[sid]] = 1
        static[:, -1] = np.log1p(scale) / 5
        target = self.y[fidx]
        weight = (1 - self.closed[fidx]) * (1 - self.stockout[fidx])
        return {"past": past, "future": future, "static": static, "mask": obs == 0, "scale": scale,
                "target": target.astype(np.float32), "weight": weight.astype(np.float32),
                "future_closed": self.closed[fidx]}
