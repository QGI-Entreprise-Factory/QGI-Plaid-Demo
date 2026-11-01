# 0002: Box integration for documents

Status: **open, awaiting decision.** Documents (statements, KYC, contracts) are stored outside the transactional database.

| Option | How it works | Trade-offs |
|---|---|---|
| **Box per tenant** | Each firm connects its own Box enterprise through a Box app (JWT or Client Credentials Grant); we store only Box file IDs | Firm keeps its own retention and legal-hold controls; needs Box admin approval per tenant |
| **Box platform account + tenant folders** | One Box enterprise holds all tenants, one root folder each, enforced by collaborations | Simpler to run; weaker isolation, so not preferred for "sovereign" tenants |
| **S3 per tenant only (no Box)** | KMS-encrypted bucket in the tenant account with Object Lock for retention | Fully inside the AWS boundary; firms lose Box's collaboration features |

Whichever is chosen: credentials live in the tenant's Secrets Manager, only file IDs and metadata go in the database, documents are never passed through MCP tool results as raw content, and every access is audit-logged.
