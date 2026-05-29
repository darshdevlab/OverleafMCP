# Setup Guide

This file explains how to set up `OverleafMCP` in the major MCP-capable hosts and how to verify that it is available in a new chat.

## What This Repo Ships Today

This repository currently ships a `local stdio MCP server`.

That means it works directly with hosts that can launch local MCP servers, such as:

- Codex
- Claude Code
- Claude Desktop
- other local MCP clients

It does **not** automatically work as a remote MCP connector for hosted products such as `ChatGPT web` or `claude.ai / Claude Cowork`. Those hosted products generally expect a `remote MCP endpoint`, not a local `stdio` command.

## What Auth Means Here

There are two auth modes:

- `Session auth`
  - browser login to Overleaf
  - used for project listing, project creation, compile, PDF download, and session-first file actions
- `Git auth`
  - optional `OVERLEAF_GIT_TOKEN`
  - used only for Git-backed sync and bulk repo workflows

No GitHub token is required.

## Before Any Host Setup

From the repo root:

```bash
cd /Volumes/LocalDrive1/MCPs/OverleafMCP
npm install
npm run build
```

## Codex

Codex reads MCP servers from `~/.codex/config.toml`.

Example:

```toml
[mcp_servers.overleaf]
command = "node"
args = ["/Volumes/LocalDrive1/MCPs/OverleafMCP/packages/overleaf-mcp/dist/index.js"]

[mcp_servers.overleaf.env]
OVERLEAF_BASE_URL = "https://www.overleaf.com"
OVERLEAF_WORKSPACE_ROOT = "/Volumes/LocalDrive1/MCPs/OverleafMCP/.overleaf-workspace"
```

Notes:

- this repo also includes [codex.mcp.json](/Volumes/LocalDrive1/MCPs/OverleafMCP/codex.mcp.json) as a repo-local reference file
- after editing Codex MCP config, restart Codex or reload MCP tools

How to verify in a new Codex chat:

1. `Run overleaf_auth_status`
2. `Run overleaf_auth_login`
3. complete login in the browser
4. `Run overleaf_auth_status`
5. `Run overleaf_list_projects`

Expected:

- `overleaf_auth_status` exists
- `sessionAuthenticated` becomes `true`
- `overleaf_list_projects` runs without tool errors

## Claude Code

Claude Code supports MCP through `.mcp.json`.

Place this in the repo root or project root:

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "node",
      "args": [
        "/Volumes/LocalDrive1/MCPs/OverleafMCP/packages/overleaf-mcp/dist/index.js"
      ],
      "env": {
        "OVERLEAF_BASE_URL": "https://www.overleaf.com",
        "OVERLEAF_WORKSPACE_ROOT": "/Volumes/LocalDrive1/MCPs/OverleafMCP/.overleaf-workspace"
      }
    }
  }
}
```

Recommended verification in Claude Code:

1. run `/mcp`
2. confirm `overleaf` is listed
3. ask Claude Code:
   - `Run overleaf_auth_status`
   - `Run overleaf_auth_login`
   - `Run overleaf_list_projects`

## Claude Desktop

Claude Desktop local MCP setup uses the desktop config file and local MCP servers.

Add an `overleaf` entry to your Claude Desktop MCP config, typically `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "node",
      "args": [
        "/Volumes/LocalDrive1/MCPs/OverleafMCP/packages/overleaf-mcp/dist/index.js"
      ],
      "env": {
        "OVERLEAF_BASE_URL": "https://www.overleaf.com",
        "OVERLEAF_WORKSPACE_ROOT": "/Volumes/LocalDrive1/MCPs/OverleafMCP/.overleaf-workspace"
      }
    }
  }
}
```

Then restart Claude Desktop.

Verification in a new Claude Desktop chat:

1. `Run overleaf_auth_status`
2. `Run overleaf_auth_login`
3. sign in to Overleaf
4. `Run overleaf_list_projects`

## ChatGPT Web

ChatGPT custom connectors use MCP, but the product expects a `custom app / connector` flow and generally a `remote MCP server`, not just a local stdio command.

Important:

- this repo currently provides a local stdio server
- that is fine for Codex, Claude Code, and Claude Desktop
- it is **not** enough by itself to appear in ChatGPT web as a connector

To use it in ChatGPT web, you would need:

1. a remote MCP deployment for this server
2. ChatGPT developer mode / custom connector access in your plan or workspace
3. connector registration inside ChatGPT Apps / Connectors

So the current repo is `not plug-and-play for ChatGPT web` yet.

## Claude Cowork / claude.ai

Same constraint as ChatGPT web:

- local stdio MCP servers are not the same as remote custom connectors
- hosted Claude surfaces generally need `remote MCP`

So this repo is not directly installable there yet without a remote MCP deployment layer.

## Other MCP Hosts

If the host supports local `stdio` MCP servers, use this pattern:

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "node",
      "args": [
        "/Volumes/LocalDrive1/MCPs/OverleafMCP/packages/overleaf-mcp/dist/index.js"
      ],
      "env": {
        "OVERLEAF_BASE_URL": "https://www.overleaf.com",
        "OVERLEAF_WORKSPACE_ROOT": "/Volumes/LocalDrive1/MCPs/OverleafMCP/.overleaf-workspace"
      }
    }
  }
}
```

## How To Initialize In A New Chat

Use this exact sequence in a fresh chat after the MCP host has loaded the server:

1. `Run overleaf_auth_status`
2. `Run overleaf_auth_login`
3. complete the Overleaf login
4. `Run overleaf_auth_status`
5. `Run overleaf_list_projects`

If you want a stronger end-to-end test:

1. `Create a new Overleaf project named "MCP Connection Test"`
2. `Clone an existing project with overleaf_clone_project`
3. `Create file test.tex in that project with content \\section{Hello}`
4. `Compile that project`
5. `Delete that project with overleaf_delete_project`

If you want a tag-specific test:

1. `Run overleaf_list_tags`
2. `Create an Overleaf tag named "kamal-rituraj-projects"`
3. `Create a new Overleaf project named "Tag Connection Test" with tags [{"name":"kamal-rituraj-projects"}]`
4. `Run overleaf_list_projects`

## How To Tell Whether It Is Really Loaded

Loaded means the host can see the tools, for example:

- `overleaf_auth_status`
- `overleaf_auth_login`
- `overleaf_list_projects`

Authenticated means:

- `overleaf_auth_status` returns `sessionAuthenticated: true`

Working means:

- `overleaf_list_projects` runs
- `overleaf_list_tags` runs
- or project/file actions run successfully

## Current Host Matrix

- `Codex`: supported now
- `Claude Code`: supported now
- `Claude Desktop`: supported now
- `generic local stdio MCP clients`: supported now
- `ChatGPT web custom connector`: requires remote MCP deployment, not complete in this repo yet
- `Claude Cowork / claude.ai custom connector`: requires remote MCP deployment, not complete in this repo yet

## Official References

- OpenAI ChatGPT custom MCP connectors and developer mode
- Anthropic Claude Code MCP setup
- Anthropic Claude Desktop local MCP setup

See the README for the main project overview. This file is specifically for host setup and verification.
