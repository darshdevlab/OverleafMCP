# overleafmcp-py

Python client for `OverleafMCP`.

This package does not reimplement Overleaf logic. It launches the MCP server process and talks to it over stdio using the official Python MCP SDK.

## Install

```bash
pip install overleafmcp-py
```

## Example

```python
import asyncio

from overleafmcp_py import OverleafMCPClient


async def main() -> None:
    async with OverleafMCPClient() as client:
        projects = await client.list_projects()
        print(projects)


asyncio.run(main())
```
