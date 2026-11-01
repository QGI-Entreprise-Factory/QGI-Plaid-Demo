import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { buildAuthenticator } from '../src/auth.js';
import { buildApp } from '../src/server.js';

const KEY = 'k'.repeat(32);
const servers = [];
async function start(opts) {
  const app = buildApp({ authenticator: buildAuthenticator({ MCP_AUTH_MODE: 'apikey', MCP_API_KEY: KEY }), ...opts });
  const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  servers.push(srv);
  return `http://127.0.0.1:${srv.address().port}`;
}
after(() => servers.forEach((s) => s.close()));

const headers = (auth) => ({ 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(auth ? { authorization: `Bearer ${auth}` } : {}) });
const rpc = (url, auth, method, params) =>
  fetch(`${url}/mcp`, { method: 'POST', headers: headers(auth), body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
const toolNames = async (res) => [...(await res.text()).matchAll(/"name":"([a-z_]+)"/g)].map((m) => m[1]);

test('rejects requests without a valid key and advertises the Bearer challenge', async () => {
  const url = await start({});
  const res = await rpc(url, null, 'tools/list');
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate'), /^Bearer/);
  assert.equal((await rpc(url, 'wrong-key', 'tools/list')).status, 401);
});

test('lists the four read-only tools by default', async () => {
  const url = await start({});
  const names = await toolNames(await rpc(url, KEY, 'tools/list'));
  assert.deepEqual(names.sort(), ['create_sandbox_link_token', 'get_sandbox_user', 'list_sandbox_users', 'plaid_status']);
});

test('document tools appear only when a store is configured', async () => {
  const store = { kind: 'fake', list: async () => [{ id: '1', name: 'a.pdf' }], link: async () => ({ url: 'https://x', expires_in: 60 }) };
  const url = await start({ documents: store });
  const names = await toolNames(await rpc(url, KEY, 'tools/list'));
  assert.ok(names.includes('list_documents') && names.includes('get_document_link'));
  const res = await rpc(url, KEY, 'tools/call', { name: 'list_documents', arguments: {} });
  assert.match(await res.text(), /a\.pdf/);
});

test('oauth discovery document is served only when an issuer is configured', async () => {
  const plain = await start({});
  assert.equal((await fetch(`${plain}/.well-known/oauth-protected-resource`)).status, 404);
  const oauth = await start({ issuer: 'https://issuer.example/pool', publicUrl: 'https://mcp.example' });
  const meta = await (await fetch(`${oauth}/.well-known/oauth-protected-resource`)).json();
  assert.deepEqual(meta.authorization_servers, ['https://issuer.example/pool']);
  assert.equal(meta.resource, 'https://mcp.example/mcp');
  const challenge = (await rpc(oauth, null, 'tools/list')).headers.get('www-authenticate');
  assert.match(challenge, /resource_metadata="https:\/\/mcp\.example\/\.well-known\/oauth-protected-resource"/);
});

test('GET and DELETE on /mcp are not allowed (stateless server)', async () => {
  const url = await start({});
  assert.equal((await fetch(`${url}/mcp`)).status, 405);
  assert.equal((await fetch(`${url}/mcp`, { method: 'DELETE' })).status, 405);
});
