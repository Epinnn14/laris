from datetime import date

import numpy as np
import pandas as pd

from laris_ml import calendar_id as cal, features as F, plan, synth
from laris_ml.baselines import seasonal_naive, weekday_average
from laris_ml.trainset import Store


def test_calendar_knows_lebaran_and_ramadan():
    d = cal.islamic_dates(2026)
    assert d["idul_fitri"] == date(2026, 3, 20)
    f = dict(zip(cal.FEATURES, cal.features(pd.DatetimeIndex(["2026-03-10"]))[0]))
    assert f["ramadan"] == 1 and 0 < f["ramadan_progress"] < 1 and f["lebaran_before"] == 0
    f = dict(zip(cal.FEATURES, cal.features(pd.DatetimeIndex(["2026-03-21"]))[0]))
    assert f["lebaran"] == 1 and f["holiday"] == 1
    days = pd.date_range("2025-12-25", "2026-02-05")
    assert np.allclose(cal.table(days), cal.features(days))


def test_synthetic_shops_are_reproducible_and_plausible():
    a = synth.dataset(3, seed=5)
    b = synth.dataset(3, seed=5)
    assert all((x.qty == y.qty).all() for sa, sb in zip(a, b) for x, y in zip(sa.series, sb.series))
    s = synth.demo_shop(date(2026, 11, 17), business="warung_makan", location="kantor")
    df = pd.concat([x.frame() for x in s.series])
    by_dow = df.groupby(df.date.dt.weekday).qty.sum()
    assert by_dow[0] > 1.5 * by_dow[6]  # office warung: Monday busier than Sunday
    assert (df[df.closed].qty == 0).all()


def test_trainset_matches_app_features():
    sh = synth.dataset(1, seed=11)[0]
    s0 = sh.series[0]
    st = Store.from_shops([sh])
    g = st.gather(np.array([0]), np.array([st.ends[0] - F.HORIZON]))
    fr = s0.frame()
    start = fr.date.iloc[-F.HORIZON]
    w = F.from_history(fr[fr.date < start], start, s0.item.category, s0.business,
                       future_closed=s0.closed[-F.HORIZON:], future_promo=s0.promo[-F.HORIZON:])
    assert np.allclose(w.past, g["past"][0]) and np.allclose(w.future, g["future"][0])
    assert np.allclose(w.static, g["static"][0]) and np.isclose(w.scale, g["scale"][0])


def test_new_item_window_is_padded():
    hist = pd.DataFrame({"date": pd.date_range("2026-01-01", periods=10), "qty": [5] * 10,
                         "closed": [False] * 10, "stockout": [False] * 10, "promo": [False] * 10})
    w = F.from_history(hist, pd.Timestamp("2026-01-11"), "makanan", "kafe")
    assert w.mask.sum() == F.CONTEXT - 10 and w.scale == 5


def test_baselines_shapes_and_closed_days():
    st = Store.from_shops(synth.dataset(4, seed=3))
    b = st.batch(np.random.default_rng(0), 32)
    for fn in (seasonal_naive, weekday_average):
        q = fn(b, F.QUANTILES)
        assert q.shape == (32, F.HORIZON, len(F.QUANTILES))
        assert (q[b["future"][..., 0] > 0] == 0).all() and (q >= 0).all()


def test_shopping_list_covers_lead_time_and_respects_shelf_life():
    days = 14
    q = np.zeros((2, days, len(F.QUANTILES)))
    q[0] = np.array([8, 9, 10, 11, 12, 13])  # nasi goreng: about 10 a day
    q[1] = np.array([18, 19, 20, 21, 22, 24])  # es teh: about 20 a day
    paths = plan.sample_paths(q, n=2000)
    assert abs(np.median(paths[:, 0, 0]) - 10) < 0.6
    recipes = {"nasgor": {"beras": 150, "ayam": 50}, "esteh": {"teh": 1}}
    ings = {
        "beras": plan.IngredientInfo("beras", "Beras", "g", 1000, 180, 1, 5000, "karung", 14),
        "ayam": plan.IngredientInfo("ayam", "Ayam", "g", 0, 2, 1, 1000, "kg", 38),
        "teh": plan.IngredientInfo("teh", "Teh", "pcs", 500, 365, 2, 50, "kotak", 300),
    }
    out = {p.id: p for p in plan.shopping_list(paths, ["nasgor", "esteh"], recipes, ings, cycle_days=2)}
    # beras: ~1500 g/day for lead 1 + cycle 2 = 3 days -> ~4.5 kg needed, 1 kg on hand -> one 5 kg sack
    assert out["beras"].packs == 1 and out["beras"].stockout_risk > 0.9
    # ayam spoils in 2 days: never more than ~2 days of use
    assert out["ayam"].buy <= 2 * 500 * 1.3 + 1000 and out["ayam"].buy > 0
    # teh: 500 bags on hand, ~20/day -> nothing to buy
    assert out["teh"].buy == 0 and out["teh"].days_left > 20
    tot = plan.totals(paths, np.array([18000, 5000]))
    assert tot["revenue"].shape == (days, 3) and 250_000 < tot["revenue"][0, 1] < 330_000


def test_shopping_list_adds_known_orders():
    from laris_ml.plan import IngredientInfo, shopping_list
    paths = np.zeros((50, 1, 28))
    info = {"beras": IngredientInfo("beras", "Beras", "g", 0.0, 180, 0, 5000, "karung 5 kg", 14.0)}
    base = shopping_list(paths, ["a"], {"a": {"beras": 150}}, info)
    assert base[0].buy == 0
    extra = np.zeros(28)
    extra[0] = 100 * 150   # 100 boxed rice meals due today
    got = shopping_list(paths, ["a"], {"a": {"beras": 150}}, info, extra={"beras": extra})
    assert got[0].buy >= 15000 and got[0].packs == 3
