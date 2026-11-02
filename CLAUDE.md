# Plaid Quickstart (QGI demo)

Multi-language Plaid Quickstart: React frontend in `frontend/`, interchangeable backends in `node/`, `python/`, `ruby/`, `go/`, `java/`. Setup and run steps are in `README.md`; config comes from `.env` (copy `.env.example`, never commit it).

Backends read `PLAID_SECRET` (not the suffixed `PLAID_SECRET_sandbox` / `PLAID_SECRET_production` kept in `.env`). Start them from the **repo root** (e.g. `node node/index.js`): `dotenv` loads `.env` from the current directory, so starting inside `node/` loads nothing. Keep `PLAID_ENV=sandbox` for the demo; the production secret moves to AWS Secrets Manager at deploy time.

## Platform layout (QGI template)

- `docs/architecture.md`: AWS-native, account-per-tenant design. `docs/decisions/`: open choices (database, Box).
- `infra/`: OpenTofu. `infra/org` = organizational units + tenant guardrail SCPs; `infra/modules/tenant` = per-tenant KMS, Plaid secret shell, Cognito. Validate with `tofu init -backend=false && tofu validate`; never apply without a reviewed plan.
- `mcp-server/`: remote app MCP server (read-only, Sandbox only, bearer auth). `npm test` inside it.
- Never commit `.env`, tfstate or tfvars. The Plaid CLI is installed in WSL (Homebrew under `~/homebrew`); run `plaid login` yourself, it needs a browser.

## Plaid AI toolkit

Product guides from [Plaid-ai-coding-toolkit](https://github.com/QGI-Entreprise-Factory/Plaid-ai-coding-toolkit) live in `ai-rules/`. Read the matching guide before writing code for that product:

- `ai-rules/transactions_guide.md` — Transactions (sync, webhooks)
- `ai-rules/transfer_guide.md` — Transfer
- `ai-rules/signal_guide.md` — Signal

These guides are for building sample integrations; verify correctness, security and compliance yourself.

## Sandbox MCP server

`.mcp.json` registers the `plaid` MCP server (`uvx mcp-server-plaid`), which provides `search_documentation`, `get_mock_data_prompt`, `get_sandbox_access_token` and `simulate_webhook`. It reads `PLAID_CLIENT_ID` and `PLAID_SECRET` from the environment — use **sandbox** credentials only. Requires [`uv`](https://docs.astral.sh/uv/).

## What the sandbox can simulate

`docs/sandbox-coverage.md` maps each operation (KYC, underwriting, income, payments) to its sandbox source and account gating. KYC (Identity Verification) and underwriting (Plaid Check test users `user_credit_*`) are not covered by `sandbox-users/`; both need products enabled on the Plaid account. The MCP tool `list_sandbox_scenarios` serves the same catalog.

## Sandbox custom users

`sandbox-users/` holds custom Sandbox user JSON files from [Plaid-sandbox-custom-users](https://github.com/QGI-Entreprise-Factory/Plaid-sandbox-custom-users), grouped by product (`auth`, `transactions`, `income`, `liabilities`, ...). See `sandbox-users/README.md` for loading them via the Dashboard or `/sandbox/public_token/create`. Dates drift over time: run `python update_dates.py` from inside `sandbox-users/` (it uses relative paths) to refresh the files it lists, or re-fetch from the source repo. Note Plaid now recommends Sandbox Studio in the Dashboard for most custom-user needs.
