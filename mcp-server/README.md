# QGI Plaid MCP server (v0.2)

A remote [MCP](https://modelcontextprotocol.io) server so AI clients (Claude Code, Codex, Gemini, ChatGPT) can operate this template. Stateless Streamable HTTP, **read-only**, Plaid **Sandbox only**.

## Tools

| Tool | What it does |
|---|---|
| `plaid_status` | Which Plaid settings are configured (never returns secrets) |
| `list_sandbox_users` | Custom Sandbox test users bundled in `sandbox-users/` |
| `get_sandbox_user` | One user definition (path-checked, `.json` inside `sandbox-users/` only) |
| `create_sandbox_link_token` | Short-lived Link token in Sandbox |
| `list_documents` | Tenant documents, metadata only (only when `DOCUMENT_STORE` is set) |
| `get_document_link` | Short-lived download link for one document (file bytes never pass through MCP) |

## Authentication

| Mode | Use | Config |
|---|---|---|
| `oauth` (default when `COGNITO_ISSUER` is set) | Production. Clients sign in through the tenant's Cognito (authorization code + PKCE). The server verifies signature, issuer, `token_use=access`, `client_id` and the `qgi-mcp/tools.read` scope. | `COGNITO_ISSUER`, `COGNITO_CLIENT_ID`, `MCP_PUBLIC_URL` |
| `apikey` | Local development only. One shared key. | `MCP_API_KEY` (min 24 chars) |

In `oauth` mode the server publishes `/.well-known/oauth-protected-resource` and answers 401 with a `WWW-Authenticate: Bearer resource_metadata=...` challenge so MCP clients can discover the sign-in server. Both values come from the tenant stack outputs (`mcp_env` in `infra/tenants/<slug>`).

**Known limitation:** Amazon Cognito does not support dynamic client registration. Clients must be registered ahead of time (the tenant module registers one public client with the Claude, ChatGPT and local-inspector callback URLs). A client that insists on dynamic registration needs an OAuth front-door in front of Cognito; that is not built yet.

## Document stores (decision 0002: tenant's choice)

| `DOCUMENT_STORE` | Settings |
|---|---|
| `s3` | `DOCUMENTS_BUCKET`, optional `DOCUMENTS_PREFIX` (default `documents/`), `AWS_REGION`. Uses the instance/task IAM role; no keys. |
| `box` | `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, `BOX_ENTERPRISE_ID`, `BOX_FOLDER_ID` (Client Credentials Grant app authorised by the tenant). Keep these in the tenant's Secrets Manager. |

Both stores confine access to one prefix/folder and return only metadata and short-lived links.

## Run

```bash
cd mcp-server && npm install
export MCP_API_KEY=$(openssl rand -hex 32)   # dev mode
node --env-file=../.env src/server.js        # http://127.0.0.1:8787/mcp
npm test
```

Container: `docker compose up --build` from the repo root (port bound to localhost; put TLS in front before exposing it).

## Connect a client

- **Claude Code:** the repo `.mcp.json` registers `qgi-plaid-app` (reads `MCP_API_KEY` from the environment).
- **Codex / Gemini / ChatGPT:** need a publicly reachable HTTPS URL with the OAuth setup above.

## Roadmap

- Route requests to the right tenant when several tenants share one gateway (today: one issuer per deployment).
- Audit log of every tool call.
- Write tools (for example unlinking an Item) behind explicit confirmation.
