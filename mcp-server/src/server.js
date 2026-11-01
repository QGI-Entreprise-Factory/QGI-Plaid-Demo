import { pathToFileURL } from 'node:url';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { REQUIRED_SCOPE, buildAuthenticator } from './auth.js';
import { createDocumentStore } from './documents/index.js';
import { createSandboxLinkToken, getSandboxUser, listSandboxUsers, plaidStatus } from './tools.js';

const asText = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const asError = (err) => ({ isError: true, content: [{ type: 'text', text: String(err.message ?? err) }] });
const safely = (fn) => async (args) => {
  try {
    return asText(await fn(args ?? {}));
  } catch (err) {
    return asError(err);
  }
};

/** One server instance per request keeps the endpoint stateless. All tools are read-only. */
export function buildServer({ documents = null } = {}) {
  const server = new McpServer({ name: 'qgi-plaid', version: '0.2.0' });

  server.registerTool(
    'plaid_status',
    { description: 'Show which Plaid settings are configured (never returns secrets) and whether the server is sandbox-only.' },
    safely(() => plaidStatus()),
  );

  server.registerTool(
    'list_sandbox_users',
    { description: 'List the custom Plaid Sandbox test users bundled with this repo (auth, transactions, income, liabilities, ...).' },
    safely(() => listSandboxUsers()),
  );

  server.registerTool(
    'get_sandbox_user',
    {
      description: 'Return one custom Sandbox user definition, to load in the Plaid Dashboard or via /sandbox/public_token/create.',
      inputSchema: { file: z.string().describe('Relative path from list_sandbox_users, e.g. "liabilities/credit_card_custom_user.json"') },
    },
    safely(({ file }) => getSandboxUser(file)),
  );

  server.registerTool(
    'create_sandbox_link_token',
    {
      description: 'Create a short-lived Plaid Link token in the Sandbox environment for the demo frontend. Sandbox only.',
      inputSchema: { products: z.array(z.string()).optional().describe('Plaid products, e.g. ["transactions","auth"]. Defaults to PLAID_PRODUCTS.') },
    },
    safely(({ products }) => createSandboxLinkToken({ products })),
  );

  if (documents) {
    server.registerTool(
      'list_documents',
      {
        description: `List the tenant's documents (metadata only) from the configured ${documents.kind} store.`,
        inputSchema: { folder: z.string().optional().describe('Optional sub-folder (S3 store only)') },
      },
      safely(({ folder }) => documents.list(folder)),
    );
    server.registerTool(
      'get_document_link',
      {
        description: 'Get a short-lived download link for one document. File contents are never returned through MCP.',
        inputSchema: { id: z.string().describe('Document id from list_documents') },
      },
      safely(({ id }) => documents.link(id)),
    );
  }

  return server;
}

export function buildApp({ authenticator, documents = null, publicUrl = 'http://127.0.0.1:8787', issuer = null }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => res.json({ ok: true, auth: authenticator.mode }));

  // OAuth protected-resource metadata (RFC 9728): tells AI clients which server to sign in with.
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    if (!issuer) return res.status(404).json({ error: 'oauth not configured' });
    res.json({
      resource: `${publicUrl}/mcp`,
      authorization_servers: [issuer],
      scopes_supported: [REQUIRED_SCOPE],
      bearer_methods_supported: ['header'],
    });
  });

  app.post('/mcp', async (req, res) => {
    const identity = await authenticator.authenticate(req.get('authorization'));
    if (!identity) {
      const challenge = issuer ? `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource"` : 'Bearer';
      return res.status(401).set('WWW-Authenticate', challenge).json({ error: 'unauthorized' });
    }
    const server = buildServer({ documents });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Stateless server: no GET (SSE) or DELETE (session) support.
  const notAllowed = (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'method not allowed' });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const authenticator = buildAuthenticator();
    const port = Number(process.env.MCP_PORT ?? 8787);
    const host = process.env.MCP_HOST ?? '127.0.0.1';
    const app = buildApp({
      authenticator,
      documents: createDocumentStore(),
      publicUrl: process.env.MCP_PUBLIC_URL ?? `http://${host}:${port}`,
      issuer: authenticator.mode === 'oauth' ? process.env.COGNITO_ISSUER : null,
    });
    app.listen(port, host, () => console.log(`qgi-plaid MCP (${authenticator.mode} auth) listening on http://${host}:${port}/mcp`));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
