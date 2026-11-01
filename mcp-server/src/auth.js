import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const REQUIRED_SCOPE = 'qgi-mcp/tools.read';

/** Constant-time comparison of a presented bearer token against the dev API key. */
export function checkApiKey(token, expected) {
  const given = Buffer.from(token ?? '');
  const want = Buffer.from(expected ?? '');
  return want.length > 0 && given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Verify a Cognito access token: signature (JWKS), issuer, token_use, client and scope.
 * Cognito access tokens carry `client_id` and `scope` instead of `aud`.
 * `keys` is a jose key resolver (remote JWKS in production, local set in tests).
 */
export async function verifyAccessToken(token, { issuer, clientId, keys }) {
  const { payload } = await jwtVerify(token, keys, { issuer, algorithms: ['RS256'] });
  if (payload.token_use !== 'access') throw new Error('not an access token');
  if (payload.client_id !== clientId) throw new Error('token was issued to a different client');
  if (!String(payload.scope ?? '').split(' ').includes(REQUIRED_SCOPE)) throw new Error(`missing scope ${REQUIRED_SCOPE}`);
  return { subject: payload.sub, username: payload.username, scope: payload.scope };
}

export function remoteKeys(issuer) {
  return createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
}

/**
 * Build the request authenticator for the configured mode.
 *  - "oauth":  Cognito access tokens (production)
 *  - "apikey": one shared key (local development only)
 * Returns async (authorizationHeader) => identity | null
 */
export function buildAuthenticator(env = process.env, keysFactory = remoteKeys) {
  const mode = env.MCP_AUTH_MODE ?? (env.COGNITO_ISSUER ? 'oauth' : 'apikey');
  if (mode === 'oauth') {
    if (!env.COGNITO_ISSUER || !env.COGNITO_CLIENT_ID) throw new Error('oauth mode needs COGNITO_ISSUER and COGNITO_CLIENT_ID');
    const opts = { issuer: env.COGNITO_ISSUER, clientId: env.COGNITO_CLIENT_ID, keys: keysFactory(env.COGNITO_ISSUER) };
    return {
      mode,
      async authenticate(header) {
        const token = (header ?? '').replace(/^Bearer\s+/i, '');
        if (!token) return null;
        try {
          return await verifyAccessToken(token, opts);
        } catch {
          return null;
        }
      },
    };
  }
  if (mode === 'apikey') {
    const key = env.MCP_API_KEY;
    if (!key || key.length < 24) throw new Error('apikey mode needs MCP_API_KEY of at least 24 characters');
    return {
      mode,
      async authenticate(header) {
        return checkApiKey((header ?? '').replace(/^Bearer\s+/i, ''), key) ? { subject: 'dev-api-key' } : null;
      },
    };
  }
  throw new Error(`unknown MCP_AUTH_MODE: ${mode}`);
}
