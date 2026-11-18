"""Daily copies of the shop's database file, so a broken laptop does not lose the books.

Folders come from LARIS_BACKUP_DIR (os.pathsep-separated) or from configure(), which the
desktop app calls with its own folder and an optional second one (a flash drive, a Google
Drive folder). Only SQLite databases are copied; an online Postgres has its own backups.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from datetime import date, datetime
from pathlib import Path

_dirs: list[Path] | None = None
_lock = threading.Lock()
KEEP = 30
PREFIX = "laris-"


def configure(dirs: list[str | Path]) -> None:
    global _dirs
    _dirs = [Path(d) for d in dirs if d]


def folders() -> list[Path]:
    if _dirs is not None:
        return list(_dirs)
    env = os.environ.get("LARIS_BACKUP_DIR", "")
    return [Path(p) for p in env.split(os.pathsep) if p]


def sqlite_file(engine) -> Path | None:
    url = engine.url
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        return None
    return Path(url.database)


def _copies(folder: Path) -> list[Path]:
    return sorted(folder.glob(f"{PREFIX}*.db")) if folder.is_dir() else []


def make(engine, label: str | None = None) -> list[Path]:
    """Copy the database into every backup folder now; keep the newest KEEP copies there."""
    src = sqlite_file(engine)
    if src is None or not src.exists():
        return []
    name = f"{PREFIX}{label or datetime.now().strftime('%Y-%m-%d_%H%M')}.db"
    done = []
    with _lock:
        for folder in folders():
            try:
                folder.mkdir(parents=True, exist_ok=True)
                dest = folder / name
                tmp = dest.with_suffix(".tmp")
                a, b = sqlite3.connect(src), sqlite3.connect(tmp)
                try:
                    a.backup(b)  # consistent copy even while the till is writing
                finally:
                    a.close()  # `with` would only commit, not close
                    b.close()
                os.replace(tmp, dest)
                for old in _copies(folder)[:-KEEP]:
                    old.unlink(missing_ok=True)
                done.append(dest)
            except OSError:
                continue  # a missing flash drive must not stop the shop
    return done


def status(engine) -> dict:
    fs = folders()
    copies = [c for f in fs for c in _copies(f)]
    last = max((c.stat().st_mtime for c in copies), default=None)
    return {"available": sqlite_file(engine) is not None and bool(fs),
            "folders": [str(f) for f in fs],
            "last": datetime.fromtimestamp(last).isoformat(timespec="minutes") if last else None,
            "count": len({c.name for c in copies})}


def daily(engine, stop: threading.Event, every: float = 3600) -> None:
    """Make one copy per day (on start and then hourly checks) until stop is set."""
    while not stop.is_set():
        today = date.today().isoformat()
        for f in folders():
            if not any(c.name.startswith(f"{PREFIX}{today}") for c in _copies(f)):
                make(engine)
                break
        stop.wait(every)


def start_daily(engine) -> threading.Event | None:
    if sqlite_file(engine) is None or not folders():
        return None
    stop = threading.Event()
    threading.Thread(target=daily, args=(engine, stop), name="laris-backup", daemon=True).start()
    return stop

