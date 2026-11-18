"""Simple forecasts the model has to beat. Each returns quantiles (N, HORIZON, len(qs)) in sales units.

- seasonal naive: next Monday sells what last Monday sold
- weekday average: the average of the same weekday over the last 8 weeks (what many owners do)
- LightGBM: a gradient-boosted model on lag and calendar features, one per quantile (strong, but
  needs its own training and knows nothing beyond its hand-made features)
"""

from __future__ import annotations

import warnings

import numpy as np

from .features import CONTEXT, HORIZON


def _dow(n_ctx: int = CONTEXT, n_h: int = HORIZON) -> tuple[np.ndarray, np.ndarray]:
    # position of each past/future day in the weekly cycle, relative to the forecast start
    return (np.arange(-n_ctx, 0) % 7), (np.arange(n_h) % 7)


def seasonal_naive(b: dict[str, np.ndarray], qs: tuple[float, ...]) -> np.ndarray:
    y = b["past"][..., 0] * b["scale"][:, None]
    obs = b["past"][..., 4] > 0
    last_week = y[:, -7:]
    point = np.tile(last_week, (1, HORIZON // 7 + 1))[:, :HORIZON]
    # spread from how much each day differed from the same day a week before
    diff = np.where(obs[:, 7:] & obs[:, :-7], y[:, 7:] - y[:, :-7], np.nan)
    out = np.empty(point.shape + (len(qs),), np.float32)
    for j, q in enumerate(qs):
        with np.errstate(all="ignore"), warnings.catch_warnings():  # rows with no history are expected
            warnings.simplefilter("ignore", RuntimeWarning)
            r = np.nan_to_num(np.nanquantile(diff, q, axis=1), nan=0.0)
        out[..., j] = np.maximum(point + r[:, None], 0)
    out[b["future"][..., 0] > 0] = 0
    return out


def weekday_average(b: dict[str, np.ndarray], qs: tuple[float, ...], weeks: int = 8) -> np.ndarray:
    y = b["past"][..., 0] * b["scale"][:, None]
    ok = (b["past"][..., 4] > 0) & (b["past"][..., 1] == 0) & (b["past"][..., 2] == 0)
    pd_, fd = _dow()
    span = slice(CONTEXT - 7 * weeks, CONTEXT)
    out = np.zeros(y.shape[:1] + (HORIZON, len(qs)), np.float32)
    overall = np.array([np.quantile(r[m], qs) if m.any() else np.zeros(len(qs)) for r, m in zip(y, ok)])
    for d in range(7):
        sel = (pd_ == d)
        sel[: span.start] = False
        vals = np.where(ok[:, sel], y[:, sel], np.nan)
        with warnings.catch_warnings():  # weekdays with no open day yet are expected
            warnings.simplefilter("ignore", RuntimeWarning)
            qd = np.nan_to_num(np.nanquantile(vals, qs, axis=1).T, nan=0.0)  # (N, Q)
        have = ok[:, sel].sum(1) >= 2
        qd = np.where(have[:, None], qd, overall)
        out[:, fd == d, :] = qd[:, None, :]
    out[b["future"][..., 0] > 0] = 0
    return out


def lgbm_features(b: dict[str, np.ndarray]) -> np.ndarray:
    """One row per (window, horizon day): recent sales shape + the target day's calendar."""
    n = len(b["scale"])
    y = b["past"][..., 0]
    ok = (b["past"][..., 4] > 0) & (b["past"][..., 1] == 0)
    pd_, fd = _dow()
    wk = np.zeros((n, 7), np.float32)
    for d in range(7):
        m = ok & (pd_ == d)[None]
        wk[:, d] = (y * m).sum(1) / np.maximum(m.sum(1), 1)
    last7 = y[:, -7:]
    m28 = (y[:, -28:] * ok[:, -28:]).sum(1) / np.maximum(ok[:, -28:].sum(1), 1)
    rows = []
    for h in range(HORIZON):
        d = fd[h]
        rows.append(np.column_stack([
            np.full(n, h), wk[:, d], wk, last7[:, d], last7, m28, ok.sum(1),
            b["future"][:, h, :], b["static"],
        ]))
    return np.stack(rows, 1).reshape(n * HORIZON, -1)


class LGBMBaseline:
    def __init__(self, qs: tuple[float, ...]):
        self.qs = qs
        self.models = []

    def fit(self, b: dict[str, np.ndarray], rounds: int = 300) -> "LGBMBaseline":
        import lightgbm as lgb

        x = lgbm_features(b)
        y = (b["target"] / b["scale"][:, None]).reshape(-1)
        w = b["weight"].reshape(-1) > 0
        for q in self.qs:
            params = {"objective": "quantile", "alpha": q, "learning_rate": 0.05, "num_leaves": 63,
                      "min_data_in_leaf": 50, "bagging_fraction": 0.8, "bagging_freq": 1,
                      "feature_fraction": 0.8, "verbose": -1, "num_threads": 2}
            self.models.append(lgb.train(params, lgb.Dataset(x[w], y[w]), num_boost_round=rounds))
        return self

    def predict(self, b: dict[str, np.ndarray]) -> np.ndarray:
        x = lgbm_features(b)
        n = len(b["scale"])
        out = np.stack([m.predict(x).reshape(n, HORIZON) for m in self.models], -1)
        out = np.maximum(np.sort(out, -1), 0) * b["scale"][:, None, None]
        out[b["future"][..., 0] > 0] = 0
        return out.astype(np.float32)
