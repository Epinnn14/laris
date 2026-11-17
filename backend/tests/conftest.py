import os
from datetime import date

import pytest
from fastapi.testclient import TestClient

os.environ["LARIS_NO_AUTOAPP"] = "1"

from laris_api.main import create_app  # noqa: E402

MODEL = os.environ.get("LARIS_TEST_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "models", "larisnet"))


@pytest.fixture
def client(tmp_path):
    url = os.environ.get("LARIS_TEST_DATABASE_URL") or f"sqlite:///{tmp_path}/t.db"
    app = create_app(url, model_dir=MODEL, demo_mode=False, static_dir=str(tmp_path / "none"))
    if not url.startswith("sqlite"):  # shared server database: start every test empty
        from laris_api.db import Base
        Base.metadata.drop_all(app.state.db.engine)
        Base.metadata.create_all(app.state.db.engine)
    with app.state.db.Session() as s:
        from laris_api import store
        store.put(s, "today", date(2026, 11, 17).isoformat())
        s.commit()
    return TestClient(app)


@pytest.fixture
def owner(client):
    r = client.post("/api/setup", json={"shop_name": "Warung Uji", "business": "warung_makan", "password": "rahasia"})
    assert r.status_code == 200
    return client
