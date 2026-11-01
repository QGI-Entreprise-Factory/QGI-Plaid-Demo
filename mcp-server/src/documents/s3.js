import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const MAX_LINK_SECONDS = 300;

/**
 * Document store backed by the tenant's S3 bucket. Everything is confined to one key prefix,
 * and only metadata and short-lived download links are returned (never file bytes).
 */
export function createS3Store({ bucket, prefix = 'documents/', region, client, presign = getSignedUrl }) {
  if (!bucket) throw new Error('DOCUMENTS_BUCKET is required for the S3 document store');
  const s3 = client ?? new S3Client({ region });
  const root = prefix.endsWith('/') ? prefix : `${prefix}/`;

  const inside = (key) => key.startsWith(root) && !key.split('/').includes('..');

  return {
    kind: 's3',
    async list(sub = '') {
      const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${root}${sub}`, MaxKeys: 200 }));
      return (res.Contents ?? []).filter((o) => inside(o.Key)).map((o) => ({
        id: o.Key,
        name: o.Key.slice(root.length),
        size: o.Size,
        modified: o.LastModified?.toISOString?.() ?? null,
      }));
    },
    async link(id, ttlSeconds = 120) {
      if (!inside(id)) throw new Error('document is outside this tenant\'s document prefix');
      const expiresIn = Math.min(Math.max(1, ttlSeconds), MAX_LINK_SECONDS);
      const url = await presign(s3, new GetObjectCommand({ Bucket: bucket, Key: id }), { expiresIn });
      return { url, expires_in: expiresIn };
    },
  };
}
