# OverleafMCP

Public, security-first Model Context Protocol tooling for Overleaf.

`OverleafMCP` is intended to become a public MCP server plus multi-language client surface for automating Overleaf workflows such as project creation, template bootstrapping, file editing, asset uploads, sync, compile, and PDF retrieval.

`OverleafMCP` is a hybrid architecture:

- browser and session-driven actions for account and project UI workflows
- Git-backed sync for reliable file create, edit, delete, and bulk updates
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
- live project listing via session auth
- live blank/template project creation via session auth
- live Git-backed file create, read, update, delete, upload, and sync operations
- live compile and PDF download via session auth
- live archive-to-project import through blank project creation plus Git sync

Still pending:

- project tag creation and assignment
- broader browser-driven project management flows beyond the current HTTP and Git transport coverage

## Security Model

This project should not become a credential exfiltration vector. The baseline rules are:

- users bring their own Overleaf credentials
- credentials are read from environment variables or supplied by the MCP host
- credentials are never persisted by default
- raw session cookies are treated as high-sensitivity secrets
- Git tokens are preferred for repository-style file workflows when available
- browser automation should reuse an explicit user-approved session, not scrape login credentials
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

## Implementation Status

The current repository state is still an implementation foundation:

- the package layout is in place
- the MCP tool surface is defined
- the auth model is defined
- the multi-language client shape is in place
- the live Overleaf transport layer is still pending

## Authentication

Planned auth inputs:

- `OVERLEAF_BASE_URL`: optional, defaults to `https://www.overleaf.com`
- `OVERLEAF_SESSION`: session cookie for dashboard and editor actions
- `OVERLEAF_GIT_TOKEN`: Git credential for clone, pull, push, and sync
- `OVERLEAF_EMAIL`: optional username for Git flows where required

Future versions should add secure host integrations such as system keychain support and host-mediated auth prompts. Public releases should not store secrets on disk by default.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set authentication

```bash
export OVERLEAF_BASE_URL="https://www.overleaf.com"
export OVERLEAF_SESSION="your_overleaf_session_cookie"
export OVERLEAF_GIT_TOKEN="your_overleaf_git_token"
export OVERLEAF_EMAIL="you@example.com"
```

Use only the variables required by the operation you want to perform. Session-based actions and Git-based actions are intentionally separated.

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
        "OVERLEAF_SESSION": "your_overleaf_session_cookie",
        "OVERLEAF_GIT_TOKEN": "your_overleaf_git_token",
        "OVERLEAF_EMAIL": "you@example.com"
      }
    }
  }
}
```

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
