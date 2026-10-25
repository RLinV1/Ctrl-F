"""Database fixtures. Tests use their own database, never the one in DATABASE_URL.

TEST_DATABASE_URL defaults to the docker-compose Postgres. The database is created
if missing and migrated with Alembic, so the tests also exercise the migration.
Database tests are skipped when Postgres isn't reachable.
"""

import os
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from psycopg import sql
from sqlalchemy import Engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from ctrlf_db.session import make_engine, sqlalchemy_url

DESKTOP = Path(__file__).resolve().parents[1]
TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://ctrlf:ctrlf@127.0.0.1:5432/ctrlf_photos_test"
)
TABLES = "detections, items, photos, jobs, zones, device_heartbeats"


def _ensure_database(url: str) -> None:
    u = make_url(sqlalchemy_url(url))
    admin = u.set(drivername="postgresql", database="postgres").render_as_string(
        hide_password=False
    )
    with psycopg.connect(admin, autocommit=True, connect_timeout=3) as conn:
        exists = conn.execute("select 1 from pg_database where datname = %s", [u.database])
        if exists.fetchone() is None:
            conn.execute(sql.SQL("create database {}").format(sql.Identifier(u.database)))


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    try:
        _ensure_database(TEST_URL)
    except psycopg.OperationalError as e:
        pytest.skip(f"Postgres not reachable at TEST_DATABASE_URL: {e}")
    cfg = Config(str(DESKTOP / "alembic.ini"))
    cfg.cmd_opts = type("Opts", (), {"x": [f"url={TEST_URL}"]})()
    command.downgrade(cfg, "base")  # start from nothing, and exercise downgrade too
    command.upgrade(cfg, "head")
    eng = make_engine(TEST_URL)
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with engine.begin() as conn:
        conn.execute(text(f"truncate {TABLES} cascade"))
    with Session(engine, expire_on_commit=False) as s:
        yield s
