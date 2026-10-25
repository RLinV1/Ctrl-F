"""Check real stdio registration; the tool uses an unreachable disposable DB URL."""

import asyncio
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def test_stdio_tool_registration():
    async def check():
        params = StdioServerParameters(command=sys.executable,
            args=[str(Path(__file__).resolve().parents[1] / "memory_server.py")],
            env={"MEMORY_DATABASE_URL":"postgresql://test:test@127.0.0.1:1/unused"})
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                assert [tool.name for tool in tools.tools] == ["lookup_last_sighting"]
                result = await session.call_tool("lookup_last_sighting", {"item_id":"bad", "before":"2026-10-25T10:00:00Z"})
                assert result.isError
    asyncio.run(asyncio.wait_for(check(), timeout=15))
