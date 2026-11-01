import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { REQUIRED_SCOPE, buildAuthenticator, checkApiKey, verifyAccessToken } from '../src/auth.js';

const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST';
const clientId = 'client-123';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims = {}, { iss = issuer, exp = '10m' } = {}) =>
    new SignJWT({ token_use: 'access', client_id: clientId, scope: `openid ${REQUIRED_SCOPE}`, username: 'sam', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(iss)
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey);
  return { keys, sign };
}

test('accepts a valid Cognito access token', async () => {
  const { keys, sign } = await setup();
  const who = await verifyAccessToken(await sign(), { issuer, clientId, keys });
  assert.equal(who.subject, 'user-1');
});

test('rejects wrong issuer, wrong client, missing scope, id tokens and expired tokens', async () => {
  const { keys, sign } = await setup();
  const opts = { issuer, clientId, keys };
  await assert.rejects(verifyAccessToken(await sign({}, { iss: 'https://evil.example' }), opts));
  await assert.rejects(verifyAccessToken(await sign({ client_id: 'other' }), opts), /different client/);
  await assert.rejects(verifyAccessToken(await sign({ scope: 'openid' }), opts), /missing scope/);
  await assert.rejects(verifyAccessToken(await sign({ token_use: 'id' }), opts), /not an access token/);
  await assert.rejects(verifyAccessToken(await sign({}, { exp: '-1m' }), opts));
});

test('rejects a token signed by a different key', async () => {
  const { keys } = await setup();
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT({ token_use: 'access', client_id: clientId, scope: REQUIRED_SCOPE })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(issuer)
    .setExpirationTime('10m')
    .sign(other.privateKey);
  await assert.rejects(verifyAccessToken(forged, { issuer, clientId, keys }));
});

test('oauth authenticator returns null for missing or bad tokens', async () => {
  const { keys, sign } = await setup();
  const auth = buildAuthenticator({ COGNITO_ISSUER: issuer, COGNITO_CLIENT_ID: clientId }, () => keys);
  assert.equal(auth.mode, 'oauth');
  assert.equal(await auth.authenticate(undefined), null);
  assert.equal(await auth.authenticate('Bearer not-a-jwt'), null);
  assert.ok(await auth.authenticate(`Bearer ${await sign()}`));
});

test('apikey authenticator needs a long key and compares in constant time', async () => {
  assert.throws(() => buildAuthenticator({ MCP_AUTH_MODE: 'apikey', MCP_API_KEY: 'short' }));
  const key = 'k'.repeat(32);
  const auth = buildAuthenticator({ MCP_AUTH_MODE: 'apikey', MCP_API_KEY: key });
  assert.ok(await auth.authenticate(`Bearer ${key}`));
  assert.equal(await auth.authenticate(`Bearer ${'x'.repeat(32)}`), null);
  assert.equal(checkApiKey('', ''), false);
});

test('oauth mode without issuer/client is a startup error', () => {
  assert.throws(() => buildAuthenticator({ MCP_AUTH_MODE: 'oauth' }), /COGNITO_ISSUER/);
});
