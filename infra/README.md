# infra (OpenTofu)

Skeleton only. **Nothing here has been planned or applied.** Install [OpenTofu](https://opentofu.org/) (`tofu`), then:

```bash
cd infra/org
tofu init
tofu plan    # review before any apply
```

- `org/`: organizational units and guardrail (service control) policies for the existing AWS Organization.
- `modules/tenant/`: per-tenant building blocks (KMS key, Plaid secrets shell, Cognito user pool). Applied inside each tenant account.

Preconditions for `org/`:
- Run as the Organization management account with credentials from `aws sso`/a role, not long-lived keys.
- The `SERVICE_CONTROL_POLICY` type must be enabled on the organization root.
- Use a remote state backend (S3 + DynamoDB lock) before the first apply; state can contain sensitive values and is gitignored here.
