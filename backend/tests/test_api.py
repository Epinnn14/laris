from datetime import date, timedelta


def test_setup_login_and_auth_required(client):
    assert client.get("/api/state").json()["setup_needed"] is True
    assert client.get("/api/menu").status_code == 401
    client.post("/api/setup", json={"shop_name": "Warung Uji", "business": "warung_makan", "password": "rahasia"})
    assert client.get("/api/menu").status_code == 200
    client.post("/api/logout")
    client.cookies.clear()
    assert client.get("/api/menu").status_code == 401
    assert client.post("/api/login", json={"password": "salah"}).status_code == 401
    assert client.post("/api/login", json={"password": "rahasia"}).status_code == 200
    assert client.get("/api/state").json()["authed"] is True
    assert client.post("/api/setup", json={"shop_name": "x", "password": "abcdef"}).status_code == 409


def test_recording_sales_books_ingredients(owner):
    owner.post("/api/catalog/apply", json={"items": ["nasgor", "esteh"]})
    menu = {m["name"]: m for m in owner.get("/api/menu").json()}
    ings = {g["name"]: g for g in owner.get("/api/ingredients").json()}
    beras = ings["Beras"]["id"]
    owner.post("/api/stock", json={"ingredient_id": beras, "kind": "beli", "qty": 5000, "cost": 70000})
    day = "2026-11-16"
    r = owner.put(f"/api/sales/{day}", json={"entries": [{"item_id": menu["Nasi Goreng Ayam"]["id"], "qty": 10},
                                                           {"item_id": menu["Es Teh Manis"]["id"], "qty": 25}]})
    assert r.status_code == 200 and r.json()["recorded"]
    on_hand = {g["name"]: g["on_hand"] for g in owner.get("/api/ingredients").json()}
    assert on_hand["Beras"] == 5000 - 10 * 150
    # editing the day replaces the booking instead of adding to it
    owner.put(f"/api/sales/{day}", json={"entries": [{"item_id": menu["Nasi Goreng Ayam"]["id"], "qty": 4}]})
    on_hand = {g["name"]: g["on_hand"] for g in owner.get("/api/ingredients").json()}
    assert on_hand["Beras"] == 5000 - 4 * 150
    # stock count sets the level
    owner.post("/api/stock", json={"ingredient_id": beras, "kind": "opname", "qty": 3000})
    assert {g["name"]: g["on_hand"] for g in owner.get("/api/ingredients").json()}["Beras"] == 3000
    # no recording in the future
    assert owner.put("/api/sales/2026-12-01", json={"entries": []}).status_code == 422


def test_closed_day_clears_sales(owner):
    owner.post("/api/catalog/apply", json={"items": ["nasgor"]})
    item = owner.get("/api/menu").json()[0]["id"]
    owner.put("/api/sales/2026-11-15", json={"entries": [{"item_id": item, "qty": 7}]})
    r = owner.put("/api/sales/2026-11-15", json={"closed": True, "note": "libur", "entries": []}).json()
    assert r["closed"] and r["entries"][0]["qty"] == 0


def test_demo_dashboard_forecast_and_plan(owner):
    info = owner.post("/api/demo", json={"business": "warung_makan"}).json()
    assert info["items"] >= 8 and info["sales_rows"] > 1000
    d = owner.get("/api/dashboard?days=30").json()
    assert d["kpi"]["revenue"] > 0 and len(d["series"]) == 30 and d["items"][0]["abc"] == "A"
    assert all(x["price"] > 0 and x["revenue"] == x["qty"] * x["price"] for x in d["items"])
    assert {x["level"] for x in d["series"] if x["level"]} <= {"ramai", "normal", "sepi"}
    f = owner.get("/api/forecast").json()
    assert len(f["dates"]) == 28 and f["start"] == "2026-11-17"
    for it in f["items"]:
        assert all(a <= b <= c for a, b, c in zip(it["p10"], it["p50"], it["p90"]))
    assert f["totals"]["revenue"][0][1] > 0
    assert f["backtest"] is None or 0 <= f["backtest"]["accuracy"] <= 1
    # the demo warung closes on Sundays: future Sundays are treated as closed
    assert f["weekly_off"] == [6]
    sundays = [k for k, d in enumerate(f["dates"]) if date.fromisoformat(d).weekday() == 6]
    assert all(f["closed"][k] and f["totals"]["revenue"][k][2] == 0 for k in sundays)
    p = owner.get("/api/plan").json()
    assert p["items"] and all(x["buy"] >= 0 for x in p["items"])
    assert any(x["buy"] > 0 for x in p["items"])


def test_planned_closure_zeroes_the_forecast(owner):
    owner.post("/api/demo", json={"business": "kafe"})
    day = date(2026, 11, 20)
    owner.put(f"/api/days/{day}", json={"closed": True, "note": "acara keluarga"})
    f = owner.get("/api/forecast").json()
    k = f["dates"].index(day.isoformat())
    assert f["closed"][k] and all(it["p90"][k] == 0 for it in f["items"])
    assert all(row[1] == 0 for row in [f["totals"]["portions"][k]])


def test_export_csv(owner):
    owner.post("/api/catalog/apply", json={"items": ["esteh"]})
    item = owner.get("/api/menu").json()[0]["id"]
    owner.put("/api/sales/2026-11-16", json={"entries": [{"item_id": item, "qty": 3}]})
    r = owner.get("/api/export/sales.csv")
    assert r.status_code == 200 and "2026-11-16,Es Teh Manis,minuman_dingin,5000,3,0,0,15000" in r.text


def test_setup_with_full_profile_and_catalog(client):
    r = client.post("/api/setup", json={
        "shop_name": "Warung Laba", "owner_name": "Pak Dodi", "business": "warung_makan", "location": "pasar",
        "city": "Solo", "open_days": [0, 1, 2, 3, 4, 5], "cycle_days": 2, "target_revenue": 30_000_000,
        "target_margin": 0.65, "language": "en", "password": "rahasia1", "start": "catalog",
        "catalog_items": ["nasgor", "esteh"]})
    assert r.status_code == 200
    st = client.get("/api/settings").json()
    assert st["owner_name"] == "Pak Dodi" and st["open_days"] == [0, 1, 2, 3, 4, 5] and st["language"] == "en"
    assert st["cycle_days"] == 2 and st["target_revenue"] == 30_000_000 and st["target_margin"] == 0.65
    assert client.get("/api/state").json()["language"] == "en"
    menu = client.get("/api/menu").json()
    assert len(menu) == 2
    for m in menu:  # suggested price leaves 65% after ingredients, rounded up to Rp500
        assert m["suggested_price"] % 500 == 0 and 1 - m["unit_cost"] / m["suggested_price"] >= 0.65
    # the shop never opens on Sunday: Sundays are closed in the forecast without marking each one
    f = client.get("/api/forecast").json()
    assert 6 in f["weekly_off"]
    assert all(f["closed"][k] for k, d in enumerate(f["dates"]) if date.fromisoformat(d).weekday() == 6)
    t = client.get("/api/dashboard").json()["target"]  # no sales yet: no guess about the month end
    assert t["goal"] == 30_000_000 and t["done"] == 0 and t["projected"] is None and t["chance"] is None
    assert client.put("/api/settings", json={"open_days": []}).status_code == 422
    assert client.post("/api/setup", json={"shop_name": "x", "password": "123"}).status_code == 422


def test_expenses_make_net_profit(owner):
    owner.post("/api/catalog/apply", json={"items": ["nasgor"]})
    item = owner.get("/api/menu").json()[0]
    owner.put("/api/sales/2026-11-16", json={"entries": [{"item_id": item["id"], "qty": 10}]})
    assert owner.post("/api/expenses", json={"day": "2026-11-16", "category": "gas", "amount": 25000}).status_code == 201
    assert owner.post("/api/expenses", json={"day": "2026-11-20", "category": "gas", "amount": 1}).status_code == 422
    assert owner.post("/api/expenses", json={"day": "2026-11-16", "category": "pajak", "amount": 1}).status_code == 422
    k = owner.get("/api/dashboard?days=7").json()["kpi"]
    assert k["revenue"] == 10 * item["price"] and k["expenses"] == 25000
    assert k["net_profit"] == k["profit"] - k["waste_cost"] - 25000
    ex = owner.get("/api/expenses").json()
    assert len(ex) == 1
    owner.delete(f"/api/expenses/{ex[0]['id']}")
    assert owner.get("/api/expenses").json() == []


def test_weekly_summary_and_target(owner):
    owner.post("/api/demo", json={"business": "warung_makan"})
    w = owner.get("/api/summary").json()
    assert w["start"] == "2026-11-10" and w["end"] == "2026-11-16" and len(w["days"]) == 7
    assert w["revenue"] > 0 and w["net"] < w["gross"]
    assert w["next_week"]["revenue"][0] <= w["next_week"]["revenue"][1] <= w["next_week"]["revenue"][2]
    t = w["target"]
    assert t["goal"] > 0 and t["month"] == "2026-11" and t["projected"][1] > t["done"] and 0 <= t["chance"] <= 1
    assert owner.get("/api/dashboard").json()["target"]["goal"] == t["goal"]


def test_what_if_price_and_promo(owner):
    owner.post("/api/demo", json={"business": "kafe"})
    item = owner.get("/api/menu").json()[0]
    up = owner.post("/api/simulate", json={"item_id": item["id"], "new_price": item["price"] + 3000}).json()
    assert up["base"]["item_qty"][1] > up["what_if"]["item_qty"][1]
    assert up["new_price"] == item["price"] + 3000 and up["method"] == "larisnet"
    pr = owner.post("/api/simulate", json={"item_id": item["id"], "promo_start": "2026-11-18",
                                           "promo_end": "2026-11-24"}).json()
    assert pr["promo_note"] is None and pr["what_if"]["item_qty"][1] > pr["base"]["item_qty"][1]
    assert owner.post("/api/simulate", json={"item_id": 99999}).status_code == 404
    assert owner.post("/api/simulate", json={"item_id": item["id"], "sensitivity": "x"}).status_code == 422
