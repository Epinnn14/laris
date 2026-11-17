"""Database: SQLite file by default (one shop, one laptop), PostgreSQL via LARIS_DATABASE_URL online."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None = None):
    url = url or os.environ.get("LARIS_DATABASE_URL") or "sqlite:///data/laris.db"
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("sqlite:///") and not url.startswith("sqlite:///:memory:"):
        Path(url[len("sqlite:///"):]).parent.mkdir(parents=True, exist_ok=True)
    kw = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {"pool_pre_ping": True}
    engine = create_engine(url, **kw)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _fk(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA journal_mode=WAL")
    return engine


class Database:
    def __init__(self, url: str | None = None):
        self.engine = make_engine(url)
        self.Session = sessionmaker(self.engine, expire_on_commit=False)

    def create(self) -> None:
        from . import models  # noqa: F401  (registers the tables)
        Base.metadata.create_all(self.engine)

    def session(self) -> Iterator[Session]:
        with self.Session() as s:
            yield s
