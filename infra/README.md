# infra (OpenTofu)

Install [OpenTofu](https://opentofu.org/) (`winget install OpenTofu.Tofu`). Always review a plan before applying.

| Path | Purpose | Applied in |
|---|---|---|
| `org/` | Organizational units, five tenant guardrail SCPs (`guardrails.tf`), account factory (`accounts.tf`, empty `tenants` map by default) | Organization management account |
| `modules/account-baseline/` | `QGI-PlatformAdmin` and `QGI-BreakGlass` roles + alarm when break-glass is used | Every account |
| `modules/tenant/` | Private VPC, Aurora PostgreSQL Serverless v2, KMS key, S3 document bucket, Cognito user pool + MCP OAuth client, Plaid secret shell | Each tenant account |
| `tenants/_template/` | Stack that wires the two modules together; copied per tenant | Each tenant account |

## Add a tenant

```bash
scripts/new-tenant.sh <slug> <tenant-account-id> <region> <platform-account-id> <org-id>
```

1. Add the tenant to `tenants` in `infra/org` (unique email per account) and apply `org` to create the account inside the Tenants OU.
2. Run the script above with the new account id, then in `infra/tenants/<slug>`: `tofu init && tofu plan`.
3. Put the Plaid keys in the tenant's `<slug>/plaid` secret (never in code or state).
4. Copy the stack's `mcp_env` output into the MCP server's environment.

## Validate (what CI runs)

```bash
tofu fmt -check -recursive infra
(cd infra/org && tofu init -backend=false && tofu validate)
(cd infra/tenants/_template && tofu init -backend=false && tofu validate)
```

## Before the first apply

- Use credentials from SSO or a role, not long-lived keys.
- `SERVICE_CONTROL_POLICY` must be enabled on the organization root.
- Configure a remote state backend (S3 + lock) in the platform account; state can hold sensitive values and is gitignored here.
- Have a compliance contact review `org/guardrails.tf`.
- SCPs are attached to the Tenants OU only, never the root. The management account is not affected by SCPs, so keep workloads out of it.

## Bootstrap order for a new tenant (learned from the demo)

The tenant guardrail SCPs deny IAM changes to everyone except `QGI-PlatformAdmin` and `QGI-BreakGlass`, and those roles are created by the tenant stack itself. So:

1. Create the account **before** the SCPs are attached to its OU (or attach them afterwards): `tofu apply -target=aws_organizations_account.tenant` in `infra/org`.
2. First tenant apply uses the bootstrap role: `tofu apply -var assume_role_name=OrganizationAccountAccessRole` in `infra/tenants/<slug>`.
3. Attach the guardrails (`tofu apply` in `infra/org`).
4. From then on use the default role (`QGI-PlatformAdmin`). Changes to the baseline roles themselves need `QGI-BreakGlass` (MFA, 1h session, alarmed).

**New accounts take time to activate.** Right after creation, EC2/S3/KMS/Cognito/etc. return `OptInRequired` / `NotSignedUp` (only IAM works). This can last from minutes to about a day. Retry `tofu plan` later; nothing is wrong with the configuration.

Plan/state files (`*.tfplan`, `*.tfstate`, `*.tfvars`) and real tenant stacks (`infra/tenants/<slug>/`) are gitignored. Move state to a remote backend before real use.
