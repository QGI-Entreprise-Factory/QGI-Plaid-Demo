import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const USERS_DIR = path.resolve(process.env.SANDBOX_USERS_DIR ?? path.join(here, '..', '..', 'sandbox-users'));

const PLAID_SANDBOX = 'https://sandbox.plaid.com';

/** Recursively list custom sandbox user files, relative to USERS_DIR. */
export async function listSandboxUsers(dir = USERS_DIR) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

/** Read one custom sandbox user. Rejects anything that resolves outside USERS_DIR. */
export async function getSandboxUser(file, dir = USERS_DIR) {
  const full = path.resolve(dir, file);
  if (!full.startsWith(dir + path.sep) || !full.endsWith('.json')) {
    throw new Error('file must be a .json path inside sandbox-users');
  }
  return JSON.parse(await readFile(full, 'utf8'));
}

/** Report which Plaid settings are present. Never returns secret values. */
export function plaidStatus(env = process.env) {
  return {
    client_id_set: Boolean(env.PLAID_CLIENT_ID),
    secret_set: Boolean(env.PLAID_SECRET),
    env: env.PLAID_ENV ?? 'unset',
    sandbox_only: (env.PLAID_ENV ?? 'sandbox') === 'sandbox',
    products: (env.PLAID_PRODUCTS ?? '').split(',').filter(Boolean),
  };
}

/** Create a short-lived Link token in Sandbox. Refuses to run against any other environment. */
export async function createSandboxLinkToken({ products, clientUserId = 'qgi-mcp-user' }, env = process.env, fetchImpl = fetch) {
  if ((env.PLAID_ENV ?? 'sandbox') !== 'sandbox') throw new Error('MCP server v1 only talks to Plaid Sandbox');
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) throw new Error('PLAID_CLIENT_ID / PLAID_SECRET are not set');
  const res = await fetchImpl(`${PLAID_SANDBOX}/link/token/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.PLAID_CLIENT_ID,
      secret: env.PLAID_SECRET,
      client_name: 'QGI Plaid Demo',
      language: 'en',
      country_codes: (env.PLAID_COUNTRY_CODES ?? 'US').split(','),
      user: { client_user_id: clientUserId },
      products: products ?? (env.PLAID_PRODUCTS ?? 'transactions').split(','),
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Plaid error ${body.error_code ?? res.status}: ${body.error_message ?? 'request failed'}`);
  return { link_token: body.link_token, expiration: body.expiration };
}
