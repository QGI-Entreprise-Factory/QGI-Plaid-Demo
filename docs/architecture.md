# Architecture: multi-tenant, AWS-native, account-per-tenant

Status: proposed. Nothing in this document is deployed. Compliance review by a qualified person is required before real client data is stored.

## Goals
- Small financial-services firms (tenants) each serve their own business and consumer clients.
- Each tenant runs in its **own AWS account** (sovereign data, keys and audit trail). We operate all tenants from one platform with one admin plane.
- Use managed, compliance-ready services (AWS, Plaid, Box) instead of building security primitives.
- An **app MCP server** lets Claude Code, Codex, Gemini and ChatGPT operate the platform as a signed-in user.

## Account layout

```
AWS Organization (management account: no workloads)
├── OU Platform
│   ├── platform-control   admin UI/API, tenant registry, provisioning, MCP gateway
│   ├── security-audit     org CloudTrail, Config, GuardDuty (read-only for operators)
│   └── shared-services    container registry, IaC modules, central logs
└── OU Tenants
    └── tenant-<slug>      one per firm: Cognito, database, KMS, Secrets Manager, Plaid stack
```

## Isolation levels
1. **Firm vs firm:** separate AWS accounts, KMS keys, databases. Guardrails via Service Control Policies on the Tenants OU.
2. **Client vs client (inside a firm):** Cognito groups plus `client_id` checks enforced in the data layer.
3. **Operator access:** the platform assumes a time-limited, logged role into a tenant account. No standing keys; tenants see every access in CloudTrail.

## Plaid
- Plaid keys and per-user `access_token`s live **in the tenant's account**: Secrets Manager for keys, KMS-encrypted storage for tokens. The platform account holds none of a tenant's bank tokens.
- Use Plaid Link, webhooks, Signal, the Plaid CLI and Dashboard MCP, and the toolkit guides in `ai-rules/`.
- Tokens are never sent to browsers, logged, or returned by any MCP tool.

## App MCP server
- One **remote** (HTTP) MCP server in `platform-control`; all four target clients support remote MCP.
- OAuth sign-in through the tenant's Cognito; the token carries tenant and client scope, and the server acts only inside that tenant.
- Read-only tools first. Writes (for example unlinking a bank) need explicit confirmation. Every call goes to the audit log.
- Data returned by tools is treated as untrusted input by the calling AI.

## Documents
Statements and KYC files: Box or tenant S3 with KMS, per tenant preference. Structured data stays in the database.

## Regions
Default `us-east-1`. Tenants needing in-country residency (for example Canada) get `ca-central-1`. Region is a per-tenant input; SCPs deny all other regions.

## Open items
- Database engine (Aurora PostgreSQL vs DynamoDB) per workload.
- Account Factory mechanism (Control Tower vs custom Organizations automation).
- Compliance scope per tenant (SOC 2, GLBA, PCI exposure) and who signs off.
