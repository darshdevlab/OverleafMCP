import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OverleafClient, loadConfigFromEnv } from "@overleafmcp/sdk";
import { toolSchemas } from "./tools.js";

function formatResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

export function createServer(): McpServer {
  const config = loadConfigFromEnv();
  const client = new OverleafClient(config);

  const server = new McpServer({
    name: "OverleafMCP",
    version: "0.1.0"
  });

  server.tool(
    toolSchemas.listProjects.name,
    toolSchemas.listProjects.description,
    toolSchemas.listProjects.inputSchema.shape,
    async () => formatResult(await client.listProjects())
  );

  server.tool(
    toolSchemas.createProject.name,
    toolSchemas.createProject.description,
    toolSchemas.createProject.inputSchema.shape,
    async (input) => formatResult(await client.createProject(toolSchemas.createProject.inputSchema.parse(input)))
  );

  server.tool(
    toolSchemas.createFile.name,
    toolSchemas.createFile.description,
    toolSchemas.createFile.inputSchema.shape,
    async (input) => formatResult(await client.createFile(toolSchemas.createFile.inputSchema.parse(input)))
  );

  server.tool(
    toolSchemas.updateFile.name,
    toolSchemas.updateFile.description,
    toolSchemas.updateFile.inputSchema.shape,
    async (input) => formatResult(await client.updateFile(toolSchemas.updateFile.inputSchema.parse(input)))
  );

  server.tool(
    toolSchemas.deleteFile.name,
    toolSchemas.deleteFile.description,
    toolSchemas.deleteFile.inputSchema.shape,
    async (input) => formatResult(await client.deleteFile(toolSchemas.deleteFile.inputSchema.parse(input)))
  );

  server.tool(
    toolSchemas.uploadFiles.name,
    toolSchemas.uploadFiles.description,
    toolSchemas.uploadFiles.inputSchema.shape,
    async (input) => formatResult(await client.uploadFiles(toolSchemas.uploadFiles.inputSchema.parse(input)))
  );

  server.tool(
    toolSchemas.uploadProjectArchive.name,
    toolSchemas.uploadProjectArchive.description,
    toolSchemas.uploadProjectArchive.inputSchema.shape,
    async (input) =>
      formatResult(await client.uploadProjectArchive(toolSchemas.uploadProjectArchive.inputSchema.parse(input)))
  );

  server.tool(
    toolSchemas.compileProject.name,
    toolSchemas.compileProject.description,
    toolSchemas.compileProject.inputSchema.shape,
    async (input) => formatResult(await client.compileProject(toolSchemas.compileProject.inputSchema.parse(input)))
  );

  server.tool(
    toolSchemas.downloadPdf.name,
    toolSchemas.downloadPdf.description,
    toolSchemas.downloadPdf.inputSchema.shape,
    async (input) => formatResult(await client.downloadPdf(toolSchemas.downloadPdf.inputSchema.parse(input)))
  );

  server.tool(
    toolSchemas.syncPull.name,
    toolSchemas.syncPull.description,
    toolSchemas.syncPull.inputSchema.shape,
    async (input) => formatResult(await client.syncPull(toolSchemas.syncPull.inputSchema.parse(input)))
  );

  server.tool(
    toolSchemas.syncPush.name,
    toolSchemas.syncPush.description,
    toolSchemas.syncPush.inputSchema.shape,
    async (input) => formatResult(await client.syncPush(toolSchemas.syncPush.inputSchema.parse(input)))
  );

  return server;
}
