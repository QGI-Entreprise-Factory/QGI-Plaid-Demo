# 0001: Database per tenant (AWS)

Status: **open, awaiting decision.** Each tenant lives in its own AWS account (see `docs/architecture.md`), so the choice below is applied once per tenant account by `infra/modules/tenant`.

| Option | Good for | Cost shape | Trade-offs |
|---|---|---|---|
| **Aurora PostgreSQL Serverless v2** | Relational data, reporting, row-level security, most fintech apps | Scales to near-zero but has a minimum capacity charge | Most familiar; VPC networking to manage |
| **RDS PostgreSQL (single instance)** | Smallest tenants, predictable cost | Fixed, lowest at small scale | Manual scaling and failover choices |
| **DynamoDB** | Key-value access (tokens, sync cursors, webhooks), spiky traffic | Pay per request | No joins; reporting needs a second store |

Always required, whichever is chosen: encryption with the tenant KMS key, automated backups with point-in-time recovery, no public endpoint, access through IAM roles only, and the Plaid access token stored encrypted, never in plain columns.

Tenant isolation inside a firm (business vs consumer clients) is enforced by `tenant_id` + `client_id` on every row and checked in the data layer.
