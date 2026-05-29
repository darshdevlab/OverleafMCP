from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client

from .tool_names import OverleafToolName


@dataclass(slots=True)
class ServerCommand:
    command: str = "npx"
    args: list[str] = field(default_factory=lambda: ["-y", "@overleafmcp/server"])
    env: dict[str, str] | None = None


class OverleafMCPClient:
    def __init__(self, server: ServerCommand | None = None) -> None:
        self._server = server or ServerCommand()
        self._stdio_cm = None
        self._session_cm = None
        self._session: ClientSession | None = None

    async def __aenter__(self) -> "OverleafMCPClient":
        await self.connect()
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.close()

    async def connect(self) -> None:
        if self._session is not None:
            return

        params = StdioServerParameters(
            command=self._server.command,
            args=self._server.args,
            env=self._server.env,
        )
        self._stdio_cm = stdio_client(params)
        read, write = await self._stdio_cm.__aenter__()
        self._session_cm = ClientSession(read, write)
        self._session = await self._session_cm.__aenter__()
        await self._session.initialize()

    async def close(self) -> None:
        if self._session_cm is not None:
            await self._session_cm.__aexit__(None, None, None)
            self._session_cm = None
            self._session = None

        if self._stdio_cm is not None:
            await self._stdio_cm.__aexit__(None, None, None)
            self._stdio_cm = None

    async def list_tools(self) -> list[str]:
        session = self._require_session()
        response = await session.list_tools()
        return [tool.name for tool in response.tools]

    async def call_tool(self, tool_name: str, arguments: dict[str, Any] | None = None) -> Any:
        session = self._require_session()
        result = await session.call_tool(tool_name, arguments or {})
        if result.isError:
            raise RuntimeError(self._extract_text(result))

        if result.structuredContent is not None:
            return result.structuredContent

        raw_text = self._extract_text(result)
        if not raw_text:
            return None

        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            return raw_text

    async def list_projects(self) -> Any:
        return await self.call_tool(OverleafToolName.LIST_PROJECTS)

    async def auth_status(self) -> Any:
        return await self.call_tool(OverleafToolName.AUTH_STATUS)

    async def auth_login(self) -> Any:
        return await self.call_tool(OverleafToolName.AUTH_LOGIN)

    async def auth_logout(self) -> Any:
        return await self.call_tool(OverleafToolName.AUTH_LOGOUT)

    async def list_files(self, project_id: str, extension: str | None = None) -> Any:
        return await self.call_tool(
            OverleafToolName.LIST_FILES,
            {"projectId": project_id, "extension": extension},
        )

    async def read_file(self, project_id: str, path: str) -> Any:
        return await self.call_tool(
            OverleafToolName.READ_FILE,
            {"projectId": project_id, "path": path},
        )

    async def create_project(self, name: str, template_id: str | None = None, tags: list[dict[str, Any]] | None = None) -> Any:
        return await self.call_tool(
            OverleafToolName.CREATE_PROJECT,
            {
                "name": name,
                "templateId": template_id,
                "tags": tags,
            },
        )

    async def create_file(self, project_id: str, path: str, content: str) -> Any:
        return await self.call_tool(
            OverleafToolName.CREATE_FILE,
            {"projectId": project_id, "path": path, "content": content},
        )

    async def update_file(self, project_id: str, path: str, content: str) -> Any:
        return await self.call_tool(
            OverleafToolName.UPDATE_FILE,
            {"projectId": project_id, "path": path, "content": content},
        )

    async def delete_file(self, project_id: str, path: str) -> Any:
        return await self.call_tool(
            OverleafToolName.DELETE_FILE,
            {"projectId": project_id, "path": path},
        )

    async def upload_files(self, project_id: str, paths: list[str]) -> Any:
        return await self.call_tool(
            OverleafToolName.UPLOAD_FILES,
            {"projectId": project_id, "paths": paths},
        )

    async def upload_project_archive(self, archive_path: str, project_name: str | None = None) -> Any:
        return await self.call_tool(
            OverleafToolName.UPLOAD_PROJECT_ARCHIVE,
            {"archivePath": archive_path, "projectName": project_name},
        )

    async def compile_project(self, project_id: str) -> Any:
        return await self.call_tool(
            OverleafToolName.COMPILE_PROJECT,
            {"projectId": project_id},
        )

    async def download_pdf(self, project_id: str, output_path: str | None = None) -> Any:
        return await self.call_tool(
            OverleafToolName.DOWNLOAD_PDF,
            {"projectId": project_id, "outputPath": output_path},
        )

    async def sync_pull(self, project_id: str, local_path: str) -> Any:
        return await self.call_tool(
            OverleafToolName.SYNC_PULL,
            {"projectId": project_id, "localPath": local_path},
        )

    async def sync_push(self, project_id: str, local_path: str) -> Any:
        return await self.call_tool(
            OverleafToolName.SYNC_PUSH,
            {"projectId": project_id, "localPath": local_path},
        )

    def _require_session(self) -> ClientSession:
        if self._session is None:
            raise RuntimeError("Client is not connected.")
        return self._session

    @staticmethod
    def _extract_text(result: types.CallToolResult) -> str:
        texts: list[str] = []
        for item in result.content:
            if isinstance(item, types.TextContent):
                texts.append(item.text)
        return "\n".join(texts)
