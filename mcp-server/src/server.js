import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
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
export function buildServer() {
  const server = new McpServer({ name: 'qgi-plaid', version: '0.1.0' });

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

  return server;
}

function authorised(header, expected) {
  const given = Buffer.from((header ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function buildApp(apiKey) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.post('/mcp', async (req, res) => {
    if (!authorised(req.get('authorization'), apiKey)) {
      return res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'unauthorized' });
    }
    const server = buildServer();
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

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey || apiKey.length < 24) {
    console.error('MCP_API_KEY must be set to a random string of at least 24 characters (e.g. `openssl rand -hex 32`).');
    process.exit(1);
  }
  const port = Number(process.env.MCP_PORT ?? 8787);
  const host = process.env.MCP_HOST ?? '127.0.0.1';
  buildApp(apiKey).listen(port, host, () => console.log(`qgi-plaid MCP listening on http://${host}:${port}/mcp`));
}
