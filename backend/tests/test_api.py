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
    assert client.post("/api/setup", json={"shop_name": "x", "password": "abcd"}).status_code == 409


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
