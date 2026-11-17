"""Synthetic daily sales for Indonesian warung makan and cafés.

Real shop data is private and scarce, so the forecaster is pretrained on many simulated shops
whose demand follows what owners describe: busy weekdays near offices and campuses, busy
weekends in housing areas and tourist spots, more spending after payday and less at the end of
the month, a different rhythm in Ramadan (gorengan and iced drinks for berbuka, fewer lunches),
closing for mudik around Lebaran and quiet weeks after, national holidays, rainy days that sell
hot drinks, new menu items that take a few weeks to catch on, short promos, stock running out,
and plain day-to-day noise (negative binomial, so busy days vary more than quiet ones).

Each shop is sampled from its own random parameters, so the model learns the patterns rather
than one shop. Everything is reproducible from the seed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np
import pandas as pd

from . import calendar_id as cal
from .catalog import MENUS, MenuItem

LOCATIONS = {
    #               Mon   Tue   Wed   Thu   Fri   Sat   Sun   holiday school_break ramadan lebaran_after
    "kantor":      ([1.05, 1.05, 1.05, 1.05, 1.00, 0.45, 0.30], 0.40, 1.00, 0.60, 0.75),
    "kampus":      ([1.10, 1.10, 1.10, 1.05, 0.95, 0.60, 0.50], 0.60, 0.50, 0.70, 0.60),
    "perumahan":   ([0.90, 0.90, 0.90, 0.95, 1.05, 1.25, 1.20], 1.15, 1.05, 0.85, 0.90),
    "wisata":      ([0.80, 0.80, 0.80, 0.85, 1.00, 1.50, 1.40], 1.60, 1.35, 0.80, 1.20),
    "pasar":       ([1.00, 1.00, 1.00, 1.00, 1.00, 1.10, 1.10], 0.90, 1.00, 0.80, 0.85),
}
LOCATION_CHOICES = {"warung_makan": ["kantor", "kampus", "perumahan", "pasar", "wisata"],
                    "kafe": ["kampus", "perumahan", "wisata", "kantor"]}

# how each kind of item moves in Ramadan, relative to the shop's traffic
RAMADAN_CATEGORY = {
    "warung_makan": {"makanan": 1.0, "camilan": 2.0, "minuman_dingin": 1.5, "minuman_panas": 0.7},
    "kafe": {"makanan": 1.3, "camilan": 1.3, "minuman_dingin": 1.2, "minuman_panas": 0.8},
}
RAIN_CATEGORY = {"makanan": 1.0, "camilan": 1.15, "minuman_dingin": 0.75, "minuman_panas": 1.35}


@dataclass
class Series:
    """One menu item at one shop: a day per row from the day it was put on the menu."""

    shop_id: str
    business: str
    location: str
    item: MenuItem
    dates: pd.DatetimeIndex
    qty: np.ndarray        # int, portions sold
    closed: np.ndarray     # bool, shop closed that day
    promo: np.ndarray      # bool, item on promotion
    stockout: np.ndarray   # bool, ran out during the day (sales are a lower bound)
    demand: np.ndarray = field(repr=False, default=None)  # float, true mean demand (for diagnostics)

    @property
    def key(self) -> str:
        return f"{self.shop_id}/{self.item.key}"

    def frame(self) -> pd.DataFrame:
        return pd.DataFrame({"date": self.dates, "qty": self.qty, "closed": self.closed,
                             "promo": self.promo, "stockout": self.stockout})


@dataclass
class Shop:
    id: str
    business: str
    location: str
    series: list[Series]


def _rain_days(dates: pd.DatetimeIndex, rng: np.random.Generator) -> np.ndarray:
    month = dates.month.values
    p = np.where((month >= 11) | (month <= 3), 0.55, np.where((month == 4) | (month == 10), 0.35, 0.15))
    # rain comes in spells: smooth a random field a little
    raw = rng.random(len(dates) + 2)
    smooth = (raw[:-2] + raw[1:-1] + raw[2:]) / 3
    ranks = smooth.argsort().argsort() / len(smooth)
    return ranks < p


def shop(shop_id: str, start: date, days: int, rng: np.random.Generator,
         business: str | None = None, location: str | None = None, weekly_off: int | None | str = "random") -> Shop:
    business = str(business or rng.choice(["warung_makan", "kafe"], p=[0.6, 0.4]))
    location = str(location or rng.choice(LOCATION_CHOICES[business]))
    dates = pd.date_range(start, periods=days, freq="D")
    feats = cal.table(dates)
    f = {k: feats[:, i] for i, k in enumerate(cal.FEATURES)}
    dow_prof, hol_mult, school_mult, ram_mult, after_mult = LOCATIONS[location]
    dow = dates.dayofweek.values

    # ---- shop traffic (orders per day before item shares)
    base = rng.uniform(60, 250) if business == "warung_makan" else rng.uniform(40, 200)
    traffic = base * np.asarray(dow_prof)[dow] * (1 + rng.normal(0, 0.04, 7))[dow]
    if business == "kafe":
        traffic *= np.where(dow >= 4, 1.15, 1.0)  # Friday to Sunday hangouts
    pay = rng.uniform(0.05, 0.2) * (1.3 if business == "kafe" else 1.0)
    traffic *= 1 + pay * f["payday"] - rng.uniform(0.03, 0.12) * f["month_end"]
    traffic *= np.where(f["holiday"] > 0, hol_mult, 1.0)
    traffic *= np.where(f["long_weekend"] > 0, 1.0 + (hol_mult - 1.0) * 0.5, 1.0)
    traffic *= np.where(f["school_break"] > 0, school_mult, 1.0)
    ram = ram_mult if business == "warung_makan" else 0.9
    late = np.clip((f["ramadan_progress"] - 0.7) / 0.3, 0, 1)
    traffic *= np.where(f["ramadan"] > 0, ram * (1 - 0.2 * late), 1.0)
    traffic *= np.where(f["lebaran_before"] > 0, {"kantor": 0.8, "kampus": 0.8, "wisata": 1.0}.get(location, 1.05), 1.0)
    # the week of Lebaran: whoever stays open sees few customers, then a slow return
    k_leb = cal.lebaran_offset(dates)
    traffic *= np.where((k_leb >= 0) & (k_leb <= 6), 0.35 + 0.08 * np.clip(k_leb, 0, 6), 1.0)
    traffic *= np.where(f["lebaran_after"] > 0, after_mult + (1 - after_mult) * (k_leb - 7) / 14, 1.0)
    traffic *= np.where(f["idul_adha"] > 0, 0.8 if location == "perumahan" else 0.6, 1.0)
    traffic *= np.where(f["year_end"] > 0, {"wisata": 1.4, "kantor": 0.6, "kampus": 0.7}.get(location, 1.05), 1.0)
    rain = _rain_days(dates, rng)
    traffic *= np.where(rain, rng.uniform(0.8, 0.92), 1.0)
    # growth or decline, plus slow wandering
    t_years = np.arange(days) / 365
    walk = np.cumsum(rng.normal(0, 0.012, days))
    walk -= np.linspace(0, walk[-1], days) * 0.5
    traffic *= np.exp(rng.normal(0, 0.25) * t_years + walk)
    traffic *= np.exp(rng.normal(0, 0.06, days))  # day-to-day mood of the street

    # ---- days the shop is closed
    closed = np.zeros(days, dtype=bool)
    if weekly_off == "random":
        if business == "warung_makan" and location == "kantor" and rng.random() < 0.5:
            closed |= dow == 6
        elif rng.random() < 0.25:
            closed |= dow == int(rng.choice([0, 6]))
    elif weekly_off is not None:
        closed |= dow == int(weekly_off)
    if location == "kantor" and rng.random() < 0.5:
        closed |= f["holiday"] > 0
    mudik = rng.random() < (0.6 if business == "warung_makan" else 0.4)
    if mudik:
        back = int(rng.integers(3, 9))
        closed |= (k_leb >= -2) & (k_leb <= back)
    sick = rng.random(days) < 0.008
    closed |= sick | np.roll(sick & (rng.random(days) < 0.5), 1)

    # ---- items
    menu: list[MenuItem] = list(MENUS[business])
    n_items = int(rng.integers(8, min(len(menu), 14) + 1))
    chosen = [menu[i] for i in sorted(rng.choice(len(menu), n_items, replace=False))]
    pops = np.array([m.popularity for m in chosen]) * rng.lognormal(0, 0.35, n_items)
    shares = pops / pops.sum()
    orders_per_customer = rng.uniform(1.5, 2.1)
    dispersion = rng.uniform(5, 25)
    series = []
    for m, share in zip(chosen, shares):
        launch = 0
        if rng.random() < 0.2:
            launch = int(rng.integers(30, max(31, days - 60)))
        end = days
        if rng.random() < 0.05:
            end = int(rng.integers(launch + 60, days)) if launch + 60 < days else days
        mu = traffic * orders_per_customer * share
        mu = mu * np.exp(np.cumsum(rng.normal(0, 0.01, days)))  # tastes drift
        cat = m.category
        mu = mu * np.where(f["ramadan"] > 0, RAMADAN_CATEGORY[business][cat], 1.0)
        mu = mu * np.where(rain, RAIN_CATEGORY[cat], 1.0)
        if launch:
            age = np.arange(days) - launch
            ramp = np.where(age >= 0, (1 - np.exp(-np.maximum(age, 0) / 10)) * (1 + 0.5 * np.exp(-np.maximum(age, 0) / 14)), 0)
            mu = mu * ramp
        promo = np.zeros(days, dtype=bool)
        for _ in range(rng.poisson(days / 150)):
            s = int(rng.integers(0, days))
            promo[s:s + int(rng.integers(3, 8))] = True
        mu = mu * np.where(promo, rng.uniform(1.3, 1.8), 1.0)
        mu = np.where(closed, 0.0, mu)
        # negative binomial counts with mean mu
        lam = rng.gamma(dispersion, np.maximum(mu, 1e-9) / dispersion)
        qty = rng.poisson(lam)
        perishable = any(k in ("ayam", "mie_kuning", "tahu", "tempe", "alpukat", "pisang", "sayur", "bakso")
                         for k in m.recipe)
        stockout = (rng.random(days) < (0.02 if perishable else 0.005)) & ~closed & (qty > 3)
        qty = np.where(stockout, np.floor(qty * rng.uniform(0.3, 0.9, days)), qty).astype(np.int32)
        sl = slice(launch, end)
        series.append(Series(shop_id, business, location, m, dates[sl], qty[sl], closed[sl], promo[sl],
                             stockout[sl], mu[sl]))
    return Shop(shop_id, business, location, series)


def dataset(n_shops: int, seed: int = 0, start: date = date(2021, 1, 1), days: int = 1460,
            min_days: int = 240) -> list[Shop]:
    """n_shops random shops; each opened sometime in the window and has at least min_days of history."""
    rng = np.random.default_rng(seed)
    shops = []
    for i in range(n_shops):
        length = int(rng.integers(min_days, days + 1))
        offset = int(rng.integers(0, days - length + 1))
        shops.append(shop(f"s{seed}-{i:04d}", start + timedelta(days=offset), length, rng))
    return shops


def demo_shop(end: date, days: int = 420, business: str = "warung_makan", location: str = "kantor",
              seed: int = 7) -> Shop:
    """The demo shop shown in the app: about 14 months of history ending on `end`.
    A warung near offices closes on Sundays; a café opens every day."""
    rng = np.random.default_rng(seed)
    off = 6 if business == "warung_makan" and location == "kantor" else None
    return shop("demo", end - timedelta(days=days - 1), days, rng, business, location, weekly_off=off)
