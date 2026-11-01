const BOX_API = 'https://api.box.com';

/**
 * Document store backed by one Box folder, using a server-side Client Credentials Grant app that
 * the tenant authorised in its own Box enterprise. Returns metadata and short-lived download
 * links only. Access is confined to files under the configured folder.
 */
export function createBoxStore({ clientId, clientSecret, enterpriseId, folderId, fetchImpl = fetch }) {
  for (const [k, v] of Object.entries({ BOX_CLIENT_ID: clientId, BOX_CLIENT_SECRET: clientSecret, BOX_ENTERPRISE_ID: enterpriseId, BOX_FOLDER_ID: folderId })) {
    if (!v) throw new Error(`${k} is required for the Box document store`);
  }

  let cached = { token: null, expiresAt: 0 };
  async function token() {
    if (cached.token && Date.now() < cached.expiresAt - 30_000) return cached.token;
    const res = await fetchImpl(`${BOX_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        box_subject_type: 'enterprise',
        box_subject_id: enterpriseId,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Box auth failed: ${body.error ?? res.status}`);
    cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return cached.token;
  }

  async function box(path, init = {}) {
    return fetchImpl(`${BOX_API}${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${await token()}` } });
  }

  async function assertUnderFolder(fileId) {
    const res = await box(`/2.0/files/${encodeURIComponent(fileId)}?fields=path_collection`);
    if (!res.ok) throw new Error(`Box file lookup failed: ${res.status}`);
    const { path_collection } = await res.json();
    if (!path_collection.entries.some((e) => e.id === String(folderId))) {
      throw new Error('document is outside this tenant\'s Box folder');
    }
  }

  return {
    kind: 'box',
    async list() {
      const res = await box(`/2.0/folders/${encodeURIComponent(folderId)}/items?fields=id,name,size,modified_at,type&limit=200`);
      if (!res.ok) throw new Error(`Box list failed: ${res.status}`);
      const { entries } = await res.json();
      return entries.filter((e) => e.type === 'file').map((e) => ({ id: e.id, name: e.name, size: e.size, modified: e.modified_at }));
    },
    async link(id) {
      await assertUnderFolder(id);
      // Box answers /content with a 302 to a short-lived download URL; we return it without following it.
      const res = await box(`/2.0/files/${encodeURIComponent(id)}/content`, { redirect: 'manual' });
      const url = res.headers.get('location');
      if (!url) throw new Error(`Box did not return a download link (${res.status})`);
      return { url, expires_in: 15 * 60 };
    },
  };
}
