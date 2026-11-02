// Catalog of Plaid Sandbox scenarios, from docs/sandbox-coverage.md. Static and read-only: it
// describes where test data comes from; it never calls Plaid. Credentials are Sandbox test values.

const CHECK_USERS = [
  { username: 'user_bank_income', password: '{}', profile: 'Many income stream types' },
  { username: 'user_credit_bonus', password: 'any', profile: 'Bonuses inside and outside paychecks' },
  { username: 'user_credit_joint_account', password: 'any', profile: 'Two salaries, two identities on the account' },
  { username: 'user_credit_profile_excellent', password: 'any', profile: 'Positive cash flow, salary plus rental income' },
  { username: 'user_credit_profile_good', password: 'any', profile: 'Neutral cash flow, gig income' },
  { username: 'user_credit_profile_poor', password: 'any', profile: 'Net-loss cash flow, no steady income' },
];

export const SCENARIOS = [
  {
    id: 'kyc',
    title: 'KYC / identity verification',
    source: 'Identity Verification template in the Dashboard (Sandbox mode)',
    requires: 'Enable Sandbox for Identity Verification under Products',
    testData: {
      identity: 'Leslie Knope, born 1975-01-18, plus any sample identities added in the Dashboard',
      pass: 'Enter the identity exactly; data source verification passes',
      fallback: 'Right name and birthday with a wrong phone, SSN or address falls back to documents, which sandbox always passes',
      notes: 'Selfie is skipped. Repeated tests from one device trip the Network Risk rule; override it per attempt in the Dashboard.',
    },
    reference: 'https://github.com/plaid/idv-quickstart',
  },
  {
    id: 'underwriting',
    title: 'Underwriting (Plaid Check consumer report)',
    source: 'Plaid Check test users',
    requires: 'Consumer Report product access; beta modules need the account manager',
    testData: {
      institution: 'First Platypus Bank (non-OAuth); user_good has no realistic income data',
      users: CHECK_USERS,
      modules: ['Base Report', 'Income Insights', 'Network Insights (beta)', 'Cashflow Insights (beta)', 'LendScore (beta)', 'Home Lending (early availability)'],
      notes: 'The report is ready on the USER_CHECK_REPORT_READY webhook; otherwise poll.',
    },
    reference: 'https://github.com/plaid/credit-quickstart',
  },
  {
    id: 'income',
    title: 'Income (bank, payroll, gig, documents)',
    source: 'sandbox-users/income/ custom users',
    requires: 'Income product',
    testData: { users: 'Use list_sandbox_users and filter on "income/"; document fixtures live under income/document_income/' },
    reference: 'https://plaid.com/docs/sandbox/user-custom/',
  },
  {
    id: 'bank-data',
    title: 'Auth, identity, transactions, liabilities, assets, investments',
    source: 'sandbox-users/ custom users and the default user_good / pass_good',
    requires: 'None',
    testData: { users: 'Use list_sandbox_users, then get_sandbox_user to load one through /sandbox/public_token/create' },
    reference: 'https://plaid.com/docs/sandbox/test-credentials/',
  },
];

/** All scenarios, or the one matching `id`. */
export function listSandboxScenarios(id) {
  if (!id) return SCENARIOS.map(({ id, title, source, requires }) => ({ id, title, source, requires }));
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown scenario "${id}"; known: ${SCENARIOS.map((s) => s.id).join(', ')}`);
  return found;
}
