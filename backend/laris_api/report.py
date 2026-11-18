"""Results as a CSV to open in Excel: a week, a month or a year, with a plain-words note for every
week so the owner (or whoever keeps the books) can read what happened without opening Laris."""

from __future__ import annotations

import calendar
import csv
import io
import re
from datetime import date, timedelta

from sqlalchemy.orm import Session

from . import analytics, store

L = {
    "id": {
        "title": {"week": "hasil seminggu", "month": "hasil sebulan", "year": "hasil setahun"},
        "months": ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September",
                   "Oktober", "November", "Desember"],
        "days": ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"],
        "report": "Laporan", "kind": "Jenis", "period": "Periode", "made": "Dibuat", "to": "sampai",
        "summary": "Ringkasan", "revenue": "Omzet", "cost": "Modal bahan", "waste": "Bahan terbuang",
        "expenses": "Pengeluaran lain", "net": "Untung bersih", "portions": "Porsi terjual",
        "open_days": "Hari buka", "preorders": "Pesanan selesai", "money_note": "Semua angka dalam rupiah.",
        "notes": "Keterangan", "per_week": "Per minggu", "per_month": "Per bulan", "per_day": "Per hari",
        "per_item": "Per menu", "per_expense": "Pengeluaran per jenis",
        "h_slice": ["periode", "dari", "sampai", "omzet", "modal bahan", "bahan terbuang", "pengeluaran",
                    "untung bersih", "porsi", "keterangan"],
        "h_day": ["tanggal", "hari", "omzet", "modal bahan", "bahan terbuang", "pengeluaran", "untung bersih",
                  "porsi", "keterangan"],
        "h_item": ["menu", "kategori", "harga", "terjual", "omzet", "modal bahan", "untung kotor", "untung (%)"],
        "h_exp": ["jenis", "jumlah"],
        "week_n": "Minggu {n}",
        "up": "omzet naik {p}% dari {prev}", "down": "omzet turun {p}% dari {prev}", "same": "omzet hampir sama dengan {prev}",
        "prev_week": "minggu sebelumnya", "prev_month": "bulan sebelumnya",
        "top": "paling laku {name} ({qty})", "busiest": "paling ramai {day}",
        "missing": "{n} hari belum dicatat", "closed": "tutup {n} hari", "stockout": "{name} habis duluan {n} hari",
        "loss": "rugi", "no_sales": "belum ada penjualan",
        "day_closed": "tutup", "day_missing": "belum dicatat", "day_stockout": "habis: {names}",
        "exp": {"gas": "Gas", "listrik_air": "Listrik & air", "sewa": "Sewa", "gaji": "Gaji", "kemasan": "Kemasan",
                "transport": "Transport", "lainnya": "Lainnya"},
    },
    "en": {
        "title": {"week": "weekly results", "month": "monthly results", "year": "yearly results"},
        "months": ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                   "October", "November", "December"],
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "report": "Report", "kind": "Type", "period": "Period", "made": "Made on", "to": "to",
        "summary": "Summary", "revenue": "Revenue", "cost": "Ingredient cost", "waste": "Ingredients thrown away",
        "expenses": "Other expenses", "net": "Net profit", "portions": "Portions sold",
        "open_days": "Days open", "preorders": "Special orders done", "money_note": "All amounts in rupiah.",
        "notes": "Notes", "per_week": "Per week", "per_month": "Per month", "per_day": "Per day",
        "per_item": "Per menu item", "per_expense": "Expenses by type",
        "h_slice": ["period", "from", "to", "revenue", "ingredient cost", "thrown away", "expenses",
                    "net profit", "portions", "notes"],
        "h_day": ["date", "day", "revenue", "ingredient cost", "thrown away", "expenses", "net profit",
                  "portions", "notes"],
        "h_item": ["item", "category", "price", "sold", "revenue", "ingredient cost", "gross profit", "margin (%)"],
        "h_exp": ["type", "amount"],
        "week_n": "Week {n}",
        "up": "revenue up {p}% on {prev}", "down": "revenue down {p}% on {prev}", "same": "revenue about the same as {prev}",
        "prev_week": "the week before", "prev_month": "the month before",
        "top": "best seller {name} ({qty})", "busiest": "busiest on {day}",
        "missing": "{n} days not recorded", "closed": "closed {n} days", "stockout": "{name} sold out early on {n} days",
        "loss": "loss", "no_sales": "no sales yet",
        "day_closed": "closed", "day_missing": "not recorded", "day_stockout": "sold out: {names}",
        "exp": {"gas": "Gas", "listrik_air": "Electricity & water", "sewa": "Rent", "gaji": "Wages",
                "kemasan": "Packaging", "transport": "Transport", "lainnya": "Other"},
    },
}


def _date(d: date, w: dict) -> str:
    return f"{d.day} {w['months'][d.month - 1]} {d.year}"


def period_range(s: Session, period: str, month: str | None, year: int | None) -> tuple[date, date]:
    """Week: the seven days up to yesterday (as on the weekly summary page). Month and year: the
    calendar month or year, up to today when it is still running."""
    today = store.today(s)
    if period == "week":
        end = today - timedelta(days=1)
        return end - timedelta(days=6), end
    if period == "month":
        y, m = (int(x) for x in month.split("-")) if month else (today.year, today.month)
        start = date(y, m, 1)
        end = date(y, m, calendar.monthrange(y, m)[1])
    else:
        y = year or today.year
        start, end = date(y, 1, 1), date(y, 12, 31)
    return start, min(end, today)


def _weeks(start: date, end: date) -> list[tuple[date, date]]:
    """Monday-to-Sunday weeks, cut at the start and end of the period."""
    out, d = [], start
    while d <= end:
        stop = min(end, d + timedelta(days=6 - d.weekday()))
        out.append((d, stop))
        d = stop + timedelta(days=1)
    return out


def _months(start: date, end: date) -> list[tuple[date, date]]:
    out, d = [], start
    while d <= end:
        stop = min(end, date(d.year, d.month, calendar.monthrange(d.year, d.month)[1]))
        out.append((d, stop))
        d = stop + timedelta(days=1)
    return out


def _money_row(m: dict) -> list[int]:
    revenue = m["revenue"] + m["pre_revenue"]
    return [round(revenue), round(m["cost"] + m["pre_cost"]), round(m["waste"]), round(m["expense_total"]),
            round(m["net"]), int(m["portions"])]


def _note(s: Session, m: dict, prev: tuple[dict, int] | None, start: date, end: date, items: dict, w: dict,
          prev_word: str) -> str:
    """One line of plain words about a week or a month. `prev` is the period before and its length
    in days: a week cut short by the start of the month is compared per day, not in total."""
    parts = []
    revenue = m["revenue"] + m["pre_revenue"]
    if revenue == 0:
        parts.append(w["no_sales"])
    elif prev is not None:
        before = (prev[0]["revenue"] + prev[0]["pre_revenue"]) / prev[1]
        if before > 0:
            ch = (revenue / ((end - start).days + 1) - before) / before * 100
            key = "same" if abs(ch) < 2 else "up" if ch > 0 else "down"
            parts.append(w[key].format(p=round(abs(ch)), prev=prev_word))
    if m["net"] < 0 and revenue > 0:
        parts.append(w["loss"])
    top = max(m["by_item"].items(), key=lambda kv: kv[1]["revenue"], default=None)
    if top and top[1]["qty"]:
        parts.append(w["top"].format(name=items[top[0]]["name"], qty=int(top[1]["qty"])))
    if (end - start).days >= 2:
        days = {d: v["revenue"] for d, v in m["by_day"].items() if v["revenue"] > 0}
        if len(days) >= 3:
            parts.append(w["busiest"].format(day=w["days"][max(days, key=days.get).weekday()]))
    for iid, v in sorted(m["by_item"].items(), key=lambda kv: -kv[1]["stockouts"])[:2]:
        if v["stockouts"] >= 2:
            parts.append(w["stockout"].format(name=items[iid]["name"], n=v["stockouts"]))
    today = store.today(s)
    past = [start + timedelta(days=i) for i in range((min(end, today - timedelta(days=1)) - start).days + 1)]
    missing = sum(1 for d in past if d not in m["by_day"] and d not in m["closed"])
    if missing:
        parts.append(w["missing"].format(n=missing))
    if m["closed"]:
        parts.append(w["closed"].format(n=len(m["closed"])))
    return "; ".join(parts)


def build(s: Session, period: str, lang: str = "id", month: str | None = None, year: int | None = None) -> tuple[str, str]:
    """(file name, CSV text)."""
    w = L.get(lang, L["id"])
    start, end = period_range(s, period, month, year)
    items = analytics.item_table(s)
    shop = store.get(s, "shop_name").strip() or "Laris"
    total = analytics.money(s, start, end, items)

    buf = io.StringIO()
    out = csv.writer(buf, lineterminator="\r\n")
    out.writerow([w["report"], shop])
    out.writerow([w["kind"], w["title"][period].capitalize()])
    out.writerow([w["period"], f"{_date(start, w)} {w['to']} {_date(end, w)}"])
    out.writerow([w["made"], _date(store.today(s), w)])
    out.writerow([])

    out.writerow([w["summary"], w["money_note"]])
    row = _money_row(total)
    for label, v in zip((w["revenue"], w["cost"], w["waste"], w["expenses"], w["net"], w["portions"]), row):
        out.writerow([label, v])
    out.writerow([w["open_days"], total["open_days"]])
    if total["pre_count"]:
        out.writerow([w["preorders"], total["pre_count"]])
    out.writerow([])

    def slices(title: str, ranges: list[tuple[date, date]], label, prev_word: str):
        out.writerow([title])
        out.writerow(w["h_slice"])
        prev = None
        if ranges:  # the first one is compared with the same length of time just before it
            a, b = ranges[0]
            n = (b - a).days + 1
            prev = (analytics.money(s, a - timedelta(days=n), a - timedelta(days=1), items), n)
        for i, (a, b) in enumerate(ranges):
            m = analytics.money(s, a, b, items)
            out.writerow([label(i, a), a.isoformat(), b.isoformat(), *_money_row(m),
                          _note(s, m, prev, a, b, items, w, prev_word)])
            prev = (m, (b - a).days + 1)
        out.writerow([])

    if period == "week":
        out.writerow([w["notes"]])
        before = analytics.money(s, start - timedelta(days=7), start - timedelta(days=1), items)
        for part in _note(s, total, (before, 7), start, end, items, w, w["prev_week"]).split("; "):
            if part:
                out.writerow([part[0].upper() + part[1:]])
        out.writerow([])
    else:
        slices(w["per_week"], _weeks(start, end), lambda i, a: w["week_n"].format(n=i + 1), w["prev_week"])
    if period == "year":
        slices(w["per_month"], _months(start, end), lambda i, a: w["months"][a.month - 1], w["prev_month"])
    else:
        out.writerow([w["per_day"]])
        out.writerow(w["h_day"])
        today = store.today(s)
        d = start
        while d <= end:
            m = analytics.money(s, d, d, items)
            notes = []
            if d in m["closed"]:
                notes.append(w["day_closed"])
            elif d not in m["by_day"] and d < today:
                notes.append(w["day_missing"])
            gone = [items[i]["name"] for i, v in m["by_item"].items() if v["stockouts"]]
            if gone:
                notes.append(w["day_stockout"].format(names=", ".join(gone)))
            r = _money_row(m)
            out.writerow([d.isoformat(), w["days"][d.weekday()], *r, "; ".join(notes)])
            d += timedelta(days=1)
        out.writerow([])

    out.writerow([w["per_item"]])
    out.writerow(w["h_item"])
    for iid, v in sorted(total["by_item"].items(), key=lambda kv: -kv[1]["revenue"]):
        if not v["qty"]:
            continue
        it = items[iid]
        margin = round((1 - v["cost"] / v["revenue"]) * 100) if v["revenue"] else ""
        out.writerow([it["name"], it["category"], it["price"], int(v["qty"]), round(v["revenue"]), round(v["cost"]),
                      round(v["revenue"] - v["cost"]), margin])
    out.writerow([])

    if total["expenses"]:
        out.writerow([w["per_expense"]])
        out.writerow(w["h_exp"])
        for k, v in sorted(total["expenses"].items(), key=lambda kv: -kv[1]):
            out.writerow([w["exp"].get(k, k), round(v)])

    suffix = w["title"][period]
    if period == "month":
        suffix += f" {w['months'][start.month - 1]} {start.year}"
    elif period == "year":
        suffix += f" {start.year}"
    return f"{safe_name(shop)}-{suffix}.csv", buf.getvalue()


def safe_name(name: str) -> str:
    """A shop name that Windows accepts as a file name."""
    clean = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", name)
    return re.sub(r"\s+", " ", clean).strip(" .") or "Laris"
