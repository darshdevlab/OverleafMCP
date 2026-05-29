# OverleafMCP

Public, security-first Model Context Protocol tooling for Overleaf.

`OverleafMCP` is intended to become a public MCP server plus multi-language client surface for automating Overleaf workflows such as project creation, template bootstrapping, file editing, asset uploads, sync, compile, and PDF retrieval.

`OverleafMCP` is a hybrid architecture:

- browser and session-driven actions for account and project UI workflows
- session-first file operations, with Git used when available for more reliable bulk sync
- a reusable TypeScript SDK that can later power an HTTP API, CLI, or desktop integrations

## Language Support

This repository is now structured for four usage modes:

- `TypeScript`: native SDK package and MCP server implementation
- `JavaScript`: consume the same published SDK and server package from Node.js
- `Python`: thin client package that launches and talks to the MCP server over stdio
- `Go`: thin client package that launches and talks to the MCP server over stdio

The business logic still lives in the TypeScript server and SDK. Python and Go should remain client layers unless there is a very strong reason to duplicate the implementation.

## Product Shape

This repo is organized as a public monorepo:

- `packages/overleaf-sdk`: reusable TypeScript SDK for auth, project operations, file operations, and upload orchestration
- `packages/overleaf-mcp`: MCP server package users can run with `npx`
- `contracts`: language-neutral tool contract and naming surface
- `clients/python`: Python package that connects to the MCP server
- `clients/go`: Go package that connects to the MCP server

## Planned Capabilities

- Create projects from blank or template flows
- Duplicate existing projects into named copies
- Create and assign organization tags
- Create, update, and delete project files
- Upload files or full project archives
- Pull and push project changes through Overleaf Git integration
- Trigger compile and download generated PDFs
- Provide a stable MCP tool surface for Codex, Claude, and other MCP hosts

## Current Status

This repository currently provides:

- a buildable TypeScript monorepo
- a public MCP server package shape
- a reusable TypeScript SDK surface
- Python and Go thin clients that talk to the MCP server over stdio
- a shared contract file for the tool surface
- browser-driven login that captures and stores the Overleaf session locally
- live project listing via session auth
- live tag listing, creation, edit, deletion, and project assignment via session auth
- live blank/template project creation via session auth
- live project duplication via Overleaf's native clone route
- live archive-to-project import via Overleaf's native project upload route in session-only mode
- live project deletion via session auth
- live session-only text-file updates through the authenticated browser profile when direct socket writes fail
- live session-first file create, read, update, delete, and upload operations
- live Git-backed file and repository sync when an Overleaf Git token is configured
- live compile and PDF download via session auth
- live archive-to-project import through blank project creation plus session upload or Git sync

Still pending:

- broader browser-driven project management flows beyond the current HTTP and Git transport coverage

## Security Model

This project should not become a credential exfiltration vector. The baseline rules are:

- users bring their own Overleaf credentials
- credentials are read from environment variables, supplied by the MCP host, or captured through the browser login flow
- only the Overleaf session cookie is stored locally when the browser login flow is used
- raw session cookies are treated as high-sensitivity secrets
- Git tokens are preferred for repository-style file workflows when available
- browser login requires an explicit user-approved interactive login
- logs must redact cookies, bearer tokens, Git credentials, and file upload URLs

## Full Product Scope

The public API is intended to support these tool families:

- project discovery and metadata
- project creation from blank or template
- tags and organization
- file create, read, update, delete
- uploads for assets and complete project archives
- compile and PDF retrieval
- sync operations via Overleaf Git integration

This is the full target scope for `OverleafMCP`, not a reduced subset.

## Authentication

Supported auth inputs:

- `OVERLEAF_BASE_URL`: optional, defaults to `https://www.overleaf.com`
- `OVERLEAF_SESSION`: session cookie for dashboard and editor actions
- `OVERLEAF_GIT_TOKEN`: optional Git credential for clone, pull, push, and sync
- `OVERLEAF_EMAIL`: optional username for Git flows where required

Auth modes:

- `browser login`: opens a Chromium window, lets the user log in, then stores the `overleaf_session2` cookie locally
- `session env`: use `OVERLEAF_SESSION` directly
- `hybrid session + git`: adds `OVERLEAF_GIT_TOKEN` for Git-backed sync and bulk file workflows

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Choose authentication

Browser login:

```bash
npx @overleafmcp/server
```

Then call the MCP tool `overleaf_auth_login`.

Environment-based session auth:

```bash
export OVERLEAF_BASE_URL="https://www.overleaf.com"
export OVERLEAF_SESSION="your_overleaf_session_cookie"
```

Optional Git sync auth:

```bash
export OVERLEAF_GIT_TOKEN="your_overleaf_git_token"
export OVERLEAF_EMAIL="you@example.com"
```

Use only the variables required by the operation you want to perform.

### 3. Build the packages

```bash
npm run build
```

### 4. Run the MCP server

```bash
npx @overleafmcp/server
```

### 5. Add to an MCP host

Example `stdio` configuration:

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "npx",
      "args": ["-y", "@overleafmcp/server"],
      "env": {
        "OVERLEAF_SESSION": "your_overleaf_session_cookie"
      }
    }
  }
}
```

Add `OVERLEAF_GIT_TOKEN` and `OVERLEAF_EMAIL` only if you want Git-backed sync behavior.

## Codex Setup

Yes, you can keep the Codex MCP setup in the same repo.

For full host-specific setup instructions, see [SETUP.md](/Volumes/LocalDrive1/MCPs/OverleafMCP/SETUP.md).

This repo includes a ready example config at [codex.mcp.json](/Volumes/LocalDrive1/MCPs/OverleafMCP/codex.mcp.json).

It points Codex at the locally built server:

```json
{
  "mcpServers": {
    "overleaf": {
      "command": "node",
      "args": [
        "/Volumes/LocalDrive1/MCPs/OverleafMCP/packages/overleaf-mcp/dist/index.js"
      ],
      "env": {
        "OVERLEAF_BASE_URL": "https://www.overleaf.com"
      }
    }
  }
}
```

Recommended usage:

1. Build the repo with `npm run build`
2. Use the contents of `codex.mcp.json` in your Codex MCP configuration
3. Restart or reload Codex MCP tools
4. Run `overleaf_auth_login` from Codex to establish the session

Useful first checks after setup:

- `Run overleaf_auth_status`
- `Run overleaf_list_tags`
- `Clone project <projectId> into "your-v2-name"` with `overleaf_clone_project`
- `Create an Overleaf tag named "mcp-test-tag"`
- `Create a new Overleaf project named "MCP Connection Test" with tags [{"name":"mcp-test-tag"}]`
- `Delete project <projectId>` with `overleaf_delete_project`

If you prefer, you can replace the absolute `args[0]` path with your own local checkout path.

## Development

```bash
npm install
npm run build
```

Run the MCP server locally:

```bash
npx @overleafmcp/server
```

Python client package:

```bash
cd clients/python
pip install -e .
```

Go client package:

```bash
cd clients/go
go get github.com/modelcontextprotocol/go-sdk
```

## Package Layout

```text
packages/overleaf-sdk     TypeScript SDK
packages/overleaf-mcp     MCP server
clients/python            Python client package
clients/go                Go client package
contracts                 Shared tool contract
```

## Publishing Roadmap

- `npm`: publish `@overleafmcp/sdk` and `@overleafmcp/server`
- `PyPI`: publish `overleafmcp-py`
- `Go`: publish the `overleafmcp-go` module
- `GitHub`: use this repository as the public source of truth, issues, releases, and documentation

## Release Plan

Recommended publish order:

1. Publish `@overleafmcp/sdk`
2. Publish `@overleafmcp/server`
3. Publish the Python package to PyPI
4. Publish the Go module
5. Add docs site and marketing site
6. Add browser/session adapters and full Overleaf transport coverage

## Official Product Constraints

This project aims to automate Overleaf workflows, but full account/project control does not come from a single official public API. The implementation therefore needs to combine officially documented Git integration with carefully scoped automation for project-level actions such as templates, tags, uploads, and compilation.
