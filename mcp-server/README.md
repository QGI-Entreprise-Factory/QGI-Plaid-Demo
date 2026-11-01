# QGI Plaid MCP server (v1)

A remote [MCP](https://modelcontextprotocol.io) server so AI clients (Claude Code, Codex, Gemini, ChatGPT) can operate this template. Stateless Streamable HTTP, bearer-token auth, **read-only, Sandbox only**.

## Tools

| Tool | What it does |
|---|---|
| `plaid_status` | Which Plaid settings are configured (never returns secrets) |
| `list_sandbox_users` | Custom Sandbox test users bundled in `sandbox-users/` |
| `get_sandbox_user` | One user definition (path-checked, `.json` inside `sandbox-users/` only) |
| `create_sandbox_link_token` | Short-lived Link token in Sandbox |

## Run

```bash
cd mcp-server && npm install
export MCP_API_KEY=$(openssl rand -hex 32)   # min 24 chars; the server refuses to start without it
node --env-file=../.env src/server.js        # http://127.0.0.1:8787/mcp
npm test
```

## Connect a client

- **Claude Code:** the repo `.mcp.json` already registers `qgi-plaid-app` (reads `MCP_API_KEY` from the environment).
- **Codex / Gemini / ChatGPT:** point the client at the server's HTTPS URL with the header `Authorization: Bearer <MCP_API_KEY>`. ChatGPT and Gemini need a publicly reachable HTTPS URL, so deploy behind TLS first (never expose the plain HTTP port).

## Roadmap (not in v1)

- OAuth sign-in through the tenant's Cognito (replaces the shared API key; required before multi-user use).
- Per-tenant routing into each tenant's AWS account, with an audit log of every call.
- Write tools (for example unlinking an Item) behind explicit confirmation.
- Database and Box tools once decisions `0001` and `0002` in `docs/decisions/` are made.
