import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoxStore } from '../src/documents/box.js';
import { createDocumentStore } from '../src/documents/index.js';
import { MAX_LINK_SECONDS, createS3Store } from '../src/documents/s3.js';

const fakeS3 = (objects) => ({ send: async () => ({ Contents: objects }) });

test('factory returns null when unconfigured and rejects unknown stores', () => {
  assert.equal(createDocumentStore({}), null);
  assert.throws(() => createDocumentStore({ DOCUMENT_STORE: 'ftp' }), /unknown DOCUMENT_STORE/);
  assert.throws(() => createDocumentStore({ DOCUMENT_STORE: 's3' }), /DOCUMENTS_BUCKET/);
  assert.throws(() => createDocumentStore({ DOCUMENT_STORE: 'box' }), /BOX_CLIENT_ID/);
});

test('s3 store lists metadata under the tenant prefix only', async () => {
  const store = createS3Store({
    bucket: 'b',
    prefix: 'documents/',
    client: fakeS3([
      { Key: 'documents/stmt-jan.pdf', Size: 10, LastModified: new Date('2026-01-31') },
      { Key: 'other/secret.pdf', Size: 5 },
    ]),
  });
  const docs = await store.list();
  assert.deepEqual(docs.map((d) => d.name), ['stmt-jan.pdf']);
});

test('s3 links are short-lived and confined to the prefix', async () => {
  let seen;
  const store = createS3Store({ bucket: 'b', client: fakeS3([]), presign: async (_c, _cmd, opts) => ((seen = opts), 'https://signed.example/x') });
  const out = await store.link('documents/a.pdf', 99999);
  assert.equal(out.expires_in, MAX_LINK_SECONDS);
  assert.equal(seen.expiresIn, MAX_LINK_SECONDS);
  await assert.rejects(store.link('other/a.pdf'), /outside/);
  await assert.rejects(store.link('documents/../other/a.pdf'), /outside/);
});

function boxFetch({ filePath = [{ id: '0' }, { id: 'F1' }], location = 'https://dl.boxcloud.com/x' } = {}) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push(String(url));
    if (String(url).endsWith('/oauth2/token')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
    if (String(url).includes('/folders/')) return { ok: true, json: async () => ({ entries: [{ type: 'file', id: '9', name: 'kyc.pdf', size: 3, modified_at: 'now' }, { type: 'folder', id: '8', name: 'sub' }] }) };
    if (String(url).includes('path_collection')) return { ok: true, json: async () => ({ path_collection: { entries: filePath } }) };
    return { ok: false, status: 302, headers: { get: () => location } };
  };
  return { impl, calls };
}

test('box store lists files in the configured folder and authenticates once', async () => {
  const { impl, calls } = boxFetch();
  const store = createBoxStore({ clientId: 'c', clientSecret: 's', enterpriseId: 'e', folderId: 'F1', fetchImpl: impl });
  const docs = await store.list();
  await store.list();
  assert.deepEqual(docs.map((d) => d.name), ['kyc.pdf']);
  assert.equal(calls.filter((u) => u.endsWith('/oauth2/token')).length, 1);
});

test('box links only for files under the configured folder', async () => {
  const ok = boxFetch();
  const store = createBoxStore({ clientId: 'c', clientSecret: 's', enterpriseId: 'e', folderId: 'F1', fetchImpl: ok.impl });
  assert.equal((await store.link('9')).url, 'https://dl.boxcloud.com/x');

  const outside = boxFetch({ filePath: [{ id: '0' }, { id: 'OTHER' }] });
  const store2 = createBoxStore({ clientId: 'c', clientSecret: 's', enterpriseId: 'e', folderId: 'F1', fetchImpl: outside.impl });
  await assert.rejects(store2.link('9'), /outside/);
});
