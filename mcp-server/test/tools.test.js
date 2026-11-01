import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSandboxLinkToken, getSandboxUser, listSandboxUsers, plaidStatus } from '../src/tools.js';

test('lists bundled sandbox users', async () => {
  const files = await listSandboxUsers();
  assert.ok(files.includes('liabilities/credit_card_custom_user.json'));
});

test('reads a sandbox user', async () => {
  const user = await getSandboxUser('liabilities/credit_card_custom_user.json');
  assert.equal(typeof user, 'object');
});

test('rejects path traversal and non-json files', async () => {
  await assert.rejects(getSandboxUser('../.env'));
  await assert.rejects(getSandboxUser('../../README.md'));
  await assert.rejects(getSandboxUser('update_dates.py'));
});

test('plaidStatus never exposes secret values', () => {
  const s = plaidStatus({ PLAID_CLIENT_ID: 'abc', PLAID_SECRET: 'supersecret', PLAID_ENV: 'sandbox' });
  assert.equal(JSON.stringify(s).includes('supersecret'), false);
  assert.equal(s.secret_set, true);
});

test('link token creation refuses non-sandbox environments', async () => {
  await assert.rejects(
    createSandboxLinkToken({}, { PLAID_ENV: 'production', PLAID_CLIENT_ID: 'x', PLAID_SECRET: 'y' }),
    /only talks to Plaid Sandbox/,
  );
});

test('link token creation calls the sandbox host', async () => {
  let url;
  const fetchImpl = async (u) => ((url = u), { ok: true, json: async () => ({ link_token: 'link-sandbox-1', expiration: 'soon' }) });
  const out = await createSandboxLinkToken({}, { PLAID_ENV: 'sandbox', PLAID_CLIENT_ID: 'x', PLAID_SECRET: 'y' }, fetchImpl);
  assert.equal(url, 'https://sandbox.plaid.com/link/token/create');
  assert.equal(out.link_token, 'link-sandbox-1');
});
