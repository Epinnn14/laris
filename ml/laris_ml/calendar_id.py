"""Indonesian calendar facts that move sales at a warung or café.

Ramadan, Idul Fitri (Lebaran) and Idul Adha follow the Hijri calendar, so they shift about 11
days earlier every year; dates here come from the Umm al-Qura calendar (hijridate) and can be a
day off the Indonesian government's decision, which is fine for forecasting features. Owners can
still mark their own closures and events in the app.

Everything here is known in advance, so the model may use it for future days too.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache

import numpy as np
import pandas as pd
from hijridate import Gregorian, Hijri

# fixed-date national holidays (month, day)
FIXED_HOLIDAYS = {(1, 1): "Tahun Baru", (5, 1): "Hari Buruh", (6, 1): "Hari Lahir Pancasila",
                  (8, 17): "Hari Kemerdekaan", (12, 25): "Natal"}


@lru_cache(maxsize=None)
def islamic_dates(year: int) -> dict[str, date]:
    """Ramadan start, Idul Fitri, Idul Adha, Islamic New Year, Maulid and Isra Mi'raj in a Gregorian year."""
    out: dict[str, date] = {}
    h0 = Gregorian(year, 1, 1).to_hijri().year
    for hy in (h0 - 1, h0, h0 + 1):
        cand = {
            "ramadan": Hijri(hy, 9, 1),
            "idul_fitri": Hijri(hy, 10, 1),
            "idul_adha": Hijri(hy, 12, 10),
            "tahun_baru_islam": Hijri(hy, 1, 1),
            "maulid": Hijri(hy, 3, 12),
            "isra_miraj": Hijri(hy, 7, 27),
        }
        for k, h in cand.items():
            g = h.to_gregorian()
            d = date(g.year, g.month, g.day)
            if d.year == year:
                out[k] = d
    return out


def holidays(year: int) -> dict[date, str]:
    h = {date(year, m, d): n for (m, d), n in FIXED_HOLIDAYS.items()}
    names = {"idul_fitri": "Idul Fitri", "idul_adha": "Idul Adha", "tahun_baru_islam": "Tahun Baru Islam",
             "maulid": "Maulid Nabi", "isra_miraj": "Isra Mi'raj"}
    for k, d in islamic_dates(year).items():
        if k in names:
            h[d] = names[k]
    if "idul_fitri" in islamic_dates(year):
        h[islamic_dates(year)["idul_fitri"] + timedelta(days=1)] = "Idul Fitri"
    return h


def _nearest(d: date, key: str) -> date | None:
    best = None
    for y in (d.year - 1, d.year, d.year + 1):
        x = islamic_dates(y).get(key)
        if x and (best is None or abs((x - d).days) < abs((best - d).days)):
            best = x
    return best


# names of the per-day calendar features, in model order
FEATURES = [
    "dow_0", "dow_1", "dow_2", "dow_3", "dow_4", "dow_5", "dow_6",
    "dom_sin", "dom_cos",            # day of month
    "payday",                        # 25th to 3rd: salaries are paid, people eat out more
    "month_end",                     # 20th to 24th: tanggal tua, money is tight
    "ramadan",                       # fasting month
    "ramadan_progress",              # 0 at the start, 1 at the end
    "lebaran_before",                # last 7 days before Idul Fitri (mudik, takjil, THR)
    "lebaran",                       # Idul Fitri and the 6 days after (many shops close)
    "lebaran_after",                 # day 7-21 after: cities are quiet until people return
    "idul_adha",
    "holiday",                       # any national holiday
    "long_weekend",                  # a holiday next to a weekend
    "school_break",                  # rough school holidays (late June-mid July, late December)
    "year_end",                      # 24-31 December
]


def features(dates: pd.DatetimeIndex) -> np.ndarray:
    """Calendar features for each date, shape (len(dates), len(FEATURES)), float32."""
    n = len(dates)
    out = np.zeros((n, len(FEATURES)), dtype=np.float32)
    col = {k: i for i, k in enumerate(FEATURES)}
    hol_cache: dict[int, dict[date, str]] = {}
    for i, ts in enumerate(dates):
        d = ts.date()
        out[i, col[f"dow_{d.weekday()}"]] = 1
        out[i, col["dom_sin"]] = np.sin(2 * np.pi * (d.day - 1) / 31)
        out[i, col["dom_cos"]] = np.cos(2 * np.pi * (d.day - 1) / 31)
        out[i, col["payday"]] = float(d.day >= 25 or d.day <= 3)
        out[i, col["month_end"]] = float(20 <= d.day <= 24)
        rs, fitri = _nearest(d, "ramadan"), _nearest(d, "idul_fitri")
        if rs and fitri and rs <= d < fitri:
            out[i, col["ramadan"]] = 1
            out[i, col["ramadan_progress"]] = (d - rs).days / max(1, (fitri - rs).days)
        if fitri:
            k = (d - fitri).days
            out[i, col["lebaran_before"]] = float(-7 <= k < 0)
            out[i, col["lebaran"]] = float(0 <= k <= 6)
            out[i, col["lebaran_after"]] = float(7 <= k <= 21)
        adha = _nearest(d, "idul_adha")
        out[i, col["idul_adha"]] = float(adha is not None and abs((d - adha).days) <= 1)
        hol = hol_cache.setdefault(d.year, holidays(d.year))
        is_hol = d in hol
        out[i, col["holiday"]] = float(is_hol)
        near = [d + timedelta(days=j) for j in (-1, 1)]
        out[i, col["long_weekend"]] = float(
            (is_hol and any(x.weekday() >= 5 for x in near))
            or (d.weekday() >= 5 and any(x in hol_cache.setdefault(x.year, holidays(x.year)) for x in near))
        )
        out[i, col["school_break"]] = float((d.month == 6 and d.day >= 22) or (d.month == 7 and d.day <= 14)
                                            or (d.month == 12 and d.day >= 20))
        out[i, col["year_end"]] = float(d.month == 12 and d.day >= 24)
    return out


@lru_cache(maxsize=64)
def _year_table(year: int) -> tuple[np.ndarray, np.ndarray]:
    days = pd.date_range(f"{year}-01-01", f"{year}-12-31", freq="D")
    offs = np.array([((d.date() - f).days if (f := _nearest(d.date(), "idul_fitri")) else 99) for d in days],
                    dtype=np.int32)
    return features(days), offs


def table(dates: pd.DatetimeIndex) -> np.ndarray:
    """Like features(), but cached by year: fast for long or many date ranges."""
    years = dates.year.values
    out = np.empty((len(dates), len(FEATURES)), dtype=np.float32)
    for y in np.unique(years):
        m = years == y
        out[m] = _year_table(int(y))[0][dates[m].dayofyear.values - 1]
    return out


def lebaran_offset(dates: pd.DatetimeIndex) -> np.ndarray:
    """Days since the nearest Idul Fitri (negative before it)."""
    years = dates.year.values
    out = np.empty(len(dates), dtype=np.int32)
    for y in np.unique(years):
        m = years == y
        out[m] = _year_table(int(y))[1][dates[m].dayofyear.values - 1]
    return out
