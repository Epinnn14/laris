"""How Laris copes with a busy shop: a month of till orders, then timings of the real HTTP API.

    python backend/scripts/loadtest.py --per-day 3400 --days 30      # about 100,000 orders a month

It builds a fresh SQLite database (the laptop setup), records the month's orders through the
same code path as the till, and reports the database size and request timings, including
several tills saving orders at the same time.
"""

from __future__ import annotations

import argparse
import os
import random
import statistics
import tempfile
import threading
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx
import uvicorn

os.environ["LARIS_NO_AUTOAPP"] = "1"
from laris_api import store  # noqa: E402
from laris_api.main import create_app  # noqa: E402
from laris_api.models import Order  # noqa: E402

HOURS = [7] * 2 + [8] * 3 + [9] * 3 + [10] * 4 + [11] * 9 + [12] * 12 + [13] * 8 + [14] * 4 + [15] * 3 + \
        [16] * 4 + [17] * 6 + [18] * 8 + [19] * 7 + [20] * 4 + [21] * 2


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-day", type=int, default=3400)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--tills", type=int, default=4)
    a = ap.parse_args()

    work = Path(tempfile.mkdtemp(prefix="laris-load-"))
    db = work / "laris.db"
    model = Path(__file__).resolve().parents[2] / "models" / "larisnet"
    app = create_app(f"sqlite:///{db}", model_dir=str(model), demo_mode=False, static_dir=str(work / "none"))
    end = date(2026, 11, 17)
    start = end - timedelta(days=a.days)
    with app.state.db.Session() as s:
        store.put(s, "today", start.isoformat())
        s.commit()

    c = httpx.Client(base_url=f"http://127.0.0.1:{a.port}", timeout=60)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=a.port, log_level="warning"))
    th = threading.Thread(target=server.run, daemon=True)
    th.start()
    while not server.started:
        time.sleep(0.05)
    c.post("/api/setup", json={"shop_name": "Uji beban", "password": "rahasia1", "start": "catalog",
                               "catalog_items": ["nasgor", "miegor", "geprek", "soto", "nascam", "gado", "bakso",
                                                 "indomie", "tempegor", "pisgor", "esteh", "tehpanas", "esjeruk",
                                                 "kopi", "jusalpukat"]})
    items = [m["id"] for m in c.get("/api/menu").json()]
    print(f"menu items: {len(items)}")

    # ---- a month of orders, through the same function the till uses
    rng = random.Random(1)
    t0 = time.perf_counter()
    total = 0
    for k in range(a.days):
        d = start + timedelta(days=k)
        with app.state.db.Session() as s:
            store.put(s, "today", d.isoformat())
            n = int(a.per_day * rng.uniform(0.8, 1.2))
            for _ in range(n):
                lines = [(rng.choice(items), rng.choice([1, 1, 1, 2, 2, 3])) for _ in range(rng.choice([1, 1, 2, 2, 3, 4]))]
                o = store.create_order(s, lines, rng.choice(["tunai", "tunai", "qris", "transfer"]))
                o.created = datetime.combine(d, datetime.min.time()) + timedelta(hours=rng.choice(HOURS), minutes=rng.randrange(60))
            s.commit()
            total += n
    secs = time.perf_counter() - t0
    with app.state.db.Session() as s:
        store.put(s, "today", end.isoformat())
        store.bump(s)
        s.commit()
        assert s.query(Order).count() == total
    print(f"recorded {total:,} orders over {a.days} days in {secs:.0f} s ({total / secs:.0f} orders/s, one till)")
    print(f"database size: {db.stat().st_size / 1e6:.1f} MB (+ WAL {Path(str(db) + '-wal').stat().st_size / 1e6 if Path(str(db) + '-wal').exists() else 0:.1f} MB)")

    def timed(method, path, **kw):
        t = time.perf_counter()
        r = c.request(method, path, **kw)
        r.raise_for_status()
        return (time.perf_counter() - t) * 1000

    # ---- the API as the app uses it
    order = {"lines": [{"item_id": items[0], "qty": 2}, {"item_id": items[10], "qty": 2}], "method": "tunai"}
    one = [timed("POST", "/api/orders", json=order) for _ in range(200)]
    print(f"save an order (1 till): median {statistics.median(one):.0f} ms, 95% under {pct(one, .95):.0f} ms")

    errors, many = [], []

    def till():
        cl = httpx.Client(base_url=c.base_url, timeout=60, cookies=c.cookies)
        for _ in range(100):
            t = time.perf_counter()
            r = cl.post("/api/orders", json=order)
            many.append((time.perf_counter() - t) * 1000)
            if r.status_code != 201:
                errors.append(r.status_code)

    ths = [threading.Thread(target=till) for _ in range(a.tills)]
    t = time.perf_counter()
    [x.start() for x in ths]
    [x.join() for x in ths]
    wall = time.perf_counter() - t
    print(f"{a.tills} tills at once, {len(many)} orders: median {statistics.median(many):.0f} ms, 95% under "
          f"{pct(many, .95):.0f} ms, {len(many) / wall:.0f} orders/s, errors {len(errors)}")

    for path in ["/api/today", "/api/orders?limit=100", "/api/dashboard?days=30", "/api/dashboard?days=90",
                 "/api/summary", "/api/forecast", "/api/plan"]:
        ts = [timed("GET", path) for _ in range(3)]
        print(f"GET {path}: first {ts[0]:.0f} ms, then {statistics.median(ts[1:]):.0f} ms")
    server.should_exit = True
    th.join(timeout=10)


if __name__ == "__main__":
    main()
