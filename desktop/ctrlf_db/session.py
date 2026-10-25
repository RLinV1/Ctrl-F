import os

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker


def sqlalchemy_url(url: str) -> str:
    """Use psycopg 3 for plain `postgresql://` URLs (the form in .env.example)."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


def make_engine(url: str | None = None) -> Engine:
    url = url or os.environ["DATABASE_URL"]
    # A down database should fail fast, not stall the photo loop.
    return create_engine(
        sqlalchemy_url(url), pool_pre_ping=True, connect_args={"connect_timeout": 3}
    )


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)
