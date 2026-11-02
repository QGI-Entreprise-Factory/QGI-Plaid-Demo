# Sandbox coverage: what can be simulated

Which Plaid sandbox source covers which operation. Sources were read from the Plaid repos on
2026-11-02; nothing here has been run against our Plaid account yet. Items marked **unverified**
come from file names or memory, not from a README or a live call.

The file list of `sandbox-users/` matched `plaid/sandbox-custom-users` on 2026-11-02 (file names
only; contents were not compared). The same catalog is served by the MCP tool `list_sandbox_scenarios`.

The custom-user files in `sandbox-users/` only shape bank-account data. KYC and consumer-report
underwriting are separate Plaid products with their own sandbox behaviour.

| Operation | Sandbox source | Gated on account? | Status |
|---|---|---|---|
| Link, accounts, balances | Default users (`user_good` / `pass_good`) | No | Used by the Quickstart |
| Transactions | `sandbox-users/transactions/`, default users | No | Fixtures present |
| Auth (account and routing) | `sandbox-users/auth/` | No | Fixtures present |
| Identity (bank-held names, addresses) | `sandbox-users/identity/` | No | Fixtures present |
| Liabilities | `sandbox-users/liabilities/` | No | Fixtures present |
| Assets | `sandbox-users/assets/` | No | Fixtures present |
| Investments | `sandbox-users/investments/` | No | Fixtures present |
| Income (bank, payroll, gig, self-employed) | `sandbox-users/income/` | No | Fixtures present |
| Income (documents: paystub, W-2, failures) | `sandbox-users/income/document_income/` | No | Fixtures present |
| **KYC / identity verification** | Identity Verification template in the Dashboard (Sandbox mode) | Yes: enable Sandbox under Products | See below |
| **Underwriting (consumer report)** | Plaid Check test users (`user_credit_*`) | Yes: product-access request | See below |
| Fraud / risk scoring (Signal) | Not covered by custom users; see `ai-rules/signal_guide.md` | **Unverified** | Not exercised |
| Payments (Transfer) | See `ai-rules/transfer_guide.md` | **Unverified** | Not exercised |

## KYC: Identity Verification

Reference: <https://github.com/plaid/idv-quickstart> and <https://plaid.com/docs/identity-verification/testing/>.

- Create a template in the Dashboard with the toggle on Sandbox; put its id in `TEMPLATE_ID`.
  It needs a real privacy-policy URL.
- The sandbox accepts one identity: Leslie Knope, born 1975-01-18, plus any sample identities
  added in the Dashboard.
- Data Source Verification passes when the details match exactly.
- Wrong phone, SSN or address with the right name and birthday fails the data check and falls
  back to Documentary Verification, which sandbox always passes as a valid license for Leslie.
- Selfie checks are skipped in sandbox.
- Repeated tests from one device or IP fail the Network Risk rule. Override a single attempt in
  the Dashboard, or change Risk Rules to accept High Risk in the template.
- API flow: `/link/token/create`, then `/identity_verification/get` and `/list`. Retries are
  requested from the Dashboard. Webhooks: "Identity verification status updated".

Outcomes here depend on what is typed into the flow, not on which test user is chosen.

## Underwriting: Plaid Check Consumer Report

Reference: <https://github.com/plaid/credit-quickstart>.

Modules: Base Report (GA), Income Insights (GA), Network Insights (beta), Cashflow Insights
(beta), LendScore (beta), Home Lending VOA (early availability).

| Username | Password | Profile |
|---|---|---|
| `user_bank_income` | `{}` | Many income stream types |
| `user_credit_bonus` | any | Bonuses inside and outside paychecks |
| `user_credit_joint_account` | any | Two salaries, two identities |
| `user_credit_profile_excellent` | any | Positive cash flow, salary plus rental income |
| `user_credit_profile_good` | any | Neutral cash flow, gig income |
| `user_credit_profile_poor` | any | Net-loss cash flow, no steady income |

- Use a non-OAuth institution (First Platypus Bank). `user_good` has no realistic income data.
- A report is ready when the `USER_CHECK_REPORT_READY` webhook arrives; otherwise poll.
- The SSN is only sent when GSE sharing is selected.
- Consumer Report is not enabled by default. Submit a product-access request in the Dashboard.
  The beta modules and Home Lending need separate enablement through the account manager.

`plaid/credit-attributes` covers the legacy Asset Report and Bank Income products. Plaid
recommends Check for new work, so this template does not use it.

## Gaps for a lender

- A full sandbox "onboard and underwrite" run needs both products enabled on the Plaid account.
  Check the Dashboard first: Identity Verification under Products, and Consumer Report access.
- Custom users cannot add KYC or credit-report data. Use the Check test users above, or build
  synthetic bank-data fixtures for profiles they do not cover (thin file, high debt-to-income).
- Combining a KYC result with an underwriting result is the platform's job, not Plaid's.
