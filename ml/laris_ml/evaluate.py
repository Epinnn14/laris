"""Compare LarisNet with the baselines on shops it never saw.

    python -m laris_ml.evaluate --model ../models/larisnet --shops 120

Three situations, each a set of 28-day forecasts:
- normal:   the last 4 weeks of every item
- lebaran:  forecasts made 2 weeks before Idul Fitri (Ramadan end, closures, the quiet week after)
- new item: only 14 days of history

Scores are computed on open days where the item did not run out:
- MASE: mean absolute error of the median, divided by the error of "same day last week" on the history
  (below 1 beats that naive rule)
- wQL: weighted quantile loss over the 10%, 50% and 90% quantiles (lower is better)
- coverage: how often the real value fell inside the 10-90% band (ideal 80%)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from . import calendar_id as cal, synth
from .baselines import LGBMBaseline, seasonal_naive, weekday_average
from .features import CONTEXT, HORIZON, QUANTILES, Window
from .forecast import Forecaster
from .trainset import Store

EVAL_QS = (0.1, 0.5, 0.9)


def scenario_windows(store: Store, scenario: str) -> tuple[np.ndarray, np.ndarray]:
    sids, origins = [], []
    for i, (s, e) in enumerate(zip(store.starts, store.ends)):
        if scenario == "normal" and e - s >= CONTEXT + HORIZON:
            sids.append(i)
            origins.append(e - HORIZON)
        elif scenario == "new_item" and e - s >= 14 + HORIZON:
            sids.append(i)
            origins.append(s + 14)
        elif scenario == "lebaran":
            days = store.day[s:e]
            leb = store.cal_table[days, cal.FEATURES.index("lebaran")]
            starts = np.flatnonzero((leb[1:] > 0) & (leb[:-1] == 0)) + 1  # Idul Fitri day
            for f in starts:
                o = s + f - 14
                if o - s >= CONTEXT and o + HORIZON <= e:
                    sids.append(i)
                    origins.append(o)
    return np.array(sids), np.array(origins)


def metrics(q: np.ndarray, b: dict[str, np.ndarray], qs: tuple[float, ...]) -> dict[str, float]:
    y = b["target"]
    w = b["weight"] > 0
    idx = [qs.index(x) for x in EVAL_QS]
    q = q[..., idx]
    med = q[..., 1]
    # naive denominator from each window's history (open, observed days)
    past = b["past"][..., 0] * b["scale"][:, None]
    ok = (b["past"][..., 4] > 0) & (b["past"][..., 1] == 0)
    pair = ok[:, 7:] & ok[:, :-7]
    denom = np.abs(past[:, 7:] - past[:, :-7]).sum(1) / np.maximum(pair.sum(1), 1)
    err = (np.abs(y - med) * w).sum(1) / np.maximum(w.sum(1), 1)
    good = (denom > 0) & (pair.sum(1) >= 7) & (w.sum(1) > 0)
    mase = float(np.mean(err[good] / denom[good])) if good.any() else float("nan")
    loss = 0.0
    for j, a in enumerate(EVAL_QS):
        d = y - q[..., j]
        loss += (np.maximum(a * d, (a - 1) * d) * w).sum()
    wql = float(2 * loss / len(EVAL_QS) / max((np.abs(y) * w).sum(), 1e-9))
    cover = float(((y >= q[..., 0]) & (y <= q[..., 2]))[w].mean())
    mae = float((np.abs(y - med) * w).sum() / max(w.sum(), 1))
    return {"MASE": round(mase, 3), "wQL": round(wql, 3), "coverage80": round(cover, 3), "MAE": round(mae, 2)}


def run(model_dir: str, shops: int = 120, seed: int = 4242, lgbm_windows: int = 20000) -> dict:
    test = Store.from_shops(synth.dataset(shops, seed=seed))
    fc = Forecaster(model_dir)
    rng = np.random.default_rng(0)
    lgbm = None
    try:
        train = Store.from_shops(synth.dataset(200, seed=1))
        lgbm = LGBMBaseline(EVAL_QS).fit(train.batch(rng, lgbm_windows))
    except ImportError:
        pass
    results = {}
    for scenario in ("normal", "lebaran", "new_item"):
        sid, org = scenario_windows(test, scenario)
        if len(sid) == 0:
            continue
        b = test.gather(sid, org)  # new items: days before launch are padding in the store
        windows = [Window(b["past"][i], b["future"][i], b["static"][i], b["mask"][i], float(b["scale"][i]))
                   for i in range(len(sid))]
        preds = {"LarisNet": fc.predict(windows),
                 "Same day last week": seasonal_naive(b, QUANTILES),
                 "Weekday average (8 wk)": weekday_average(b, QUANTILES)}
        if lgbm is not None:
            lq = lgbm.predict(b)
            full = np.zeros(lq.shape[:2] + (len(QUANTILES),), np.float32)
            for j, a in enumerate(EVAL_QS):
                full[..., QUANTILES.index(a)] = lq[..., j]
            preds["LightGBM (lags + calendar)"] = full
        results[scenario] = {"windows": int(len(sid)),
                             **{name: metrics(q, b, QUANTILES) for name, q in preds.items()}}
    return results


def markdown(results: dict) -> str:
    lines = []
    titles = {"normal": "Normal weeks", "lebaran": "Around Lebaran", "new_item": "New items (14 days of history)"}
    for sc, r in results.items():
        lines += [f"**{titles[sc]}** ({r['windows']} forecasts of 28 days)", "",
                  "| Method | MASE | wQL | 80% band coverage | MAE (portions/day) |", "|---|---|---|---|---|"]
        for name, m in r.items():
            if name == "windows":
                continue
            lines.append(f"| {name} | {m['MASE']} | {m['wQL']} | {m['coverage80']:.0%} | {m['MAE']} |")
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="models/larisnet")
    ap.add_argument("--shops", type=int, default=120)
    ap.add_argument("--out", default=None)
    a = ap.parse_args(argv)
    res = run(a.model, a.shops)
    md = markdown(res)
    print(md)
    out = Path(a.out or a.model)
    out.mkdir(parents=True, exist_ok=True)
    (out / "eval.json").write_text(json.dumps(res, indent=2))
    (out / "eval.md").write_text(md)


if __name__ == "__main__":
    main()
