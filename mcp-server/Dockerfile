FROM node:22-alpine AS deps
WORKDIR /app
COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY mcp-server/package.json ./
COPY mcp-server/src ./src
# Bundled Sandbox user fixtures served by the list_sandbox_users / get_sandbox_user tools.
COPY sandbox-users /sandbox-users
ENV SANDBOX_USERS_DIR=/sandbox-users MCP_HOST=0.0.0.0 MCP_PORT=8787
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "src/server.js"]
