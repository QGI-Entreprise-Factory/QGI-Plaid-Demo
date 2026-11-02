import { createBoxStore } from './box.js';
import { createS3Store } from './s3.js';

/**
 * Pick the tenant's document store from configuration (decision 0002: Box or S3, tenant's choice).
 * Interface: { kind, list(sub?) -> [{id,name,size,modified}], link(id, ttl?) -> {url, expires_in} }
 * Returns null when no store is configured, so the MCP tools simply stay unregistered.
 */
export function createDocumentStore(env = process.env, deps = {}) {
  switch (env.DOCUMENT_STORE) {
    case undefined:
    case '':
      return null;
    case 's3':
      return createS3Store({ bucket: env.DOCUMENTS_BUCKET, prefix: env.DOCUMENTS_PREFIX, region: env.AWS_REGION, ...deps });
    case 'box':
      return createBoxStore({
        clientId: env.BOX_CLIENT_ID,
        clientSecret: env.BOX_CLIENT_SECRET,
        enterpriseId: env.BOX_ENTERPRISE_ID,
        folderId: env.BOX_FOLDER_ID,
        ...deps,
      });
    default:
      throw new Error(`unknown DOCUMENT_STORE "${env.DOCUMENT_STORE}" (use "s3" or "box")`);
  }
}
