"""Optional legacy MCP sighting tool; not used by the active processing worker."""

import os
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text

from ctrlf_db.repo import lookup_last_sighting
from ctrlf_db.session import make_engine, make_session_factory


def read_sighting(item_id: str, before: str, sessions) -> dict:
    """Only this query is exposed. Errors are distinct from a successful empty result."""
    identifier = uuid.UUID(item_id)
    timestamp = datetime.fromisoformat(before.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        raise ValueError("before must include a timezone")
    try:
        with sessions() as session:
            session.execute(text("SET TRANSACTION READ ONLY"))
            evidence = lookup_last_sighting(session, identifier, timestamp)
            return {"status": "available", **evidence} if evidence else {"status": "never_seen"}
    except Exception:
        return {"status": "unavailable"}


def main() -> None:
    from mcp.server.fastmcp import FastMCP

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    # A SELECT-only role is recommended even though each transaction is read-only.
    sessions = make_session_factory(make_engine(os.environ["MEMORY_DATABASE_URL"]))
    server = FastMCP("ctrlf-memory")

    @server.tool()
    def lookup_last_sighting(item_id: str, before: str) -> dict:
        """Newest stored sighting for an item UUID strictly before an ISO timestamp."""
        return read_sighting(item_id, before, sessions)

    server.run(transport="stdio")


if __name__ == "__main__":
    main()
