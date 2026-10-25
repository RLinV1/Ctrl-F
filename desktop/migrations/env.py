"""Alembic environment. Uses DATABASE_URL (or -x url=... on the command line)."""

import os
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import create_engine, pool

from ctrlf_db.models import Base
from ctrlf_db.session import sqlalchemy_url

load_dotenv()
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def database_url() -> str:
    url = context.get_x_argument(as_dictionary=True).get("url") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Set DATABASE_URL (see .env.example) or pass -x url=...")
    return sqlalchemy_url(url)


def run_migrations_offline() -> None:
    context.configure(url=database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(
        database_url(), poolclass=pool.NullPool, connect_args={"connect_timeout": 5}
    )
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
