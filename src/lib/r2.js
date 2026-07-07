// R2 access for the large-upload path (web deployment step 2). R2 speaks the S3 API, so this
// uses aws4fetch (zero dependencies, works in Node and edge runtimes) rather than the full AWS
// SDK — the only operations needed are: sign a presigned PUT URL for the browser to upload
// directly to (bypassing Vercel's ~4.5MB body cap for ~44MB bid sets), and fetch object bytes
// server-side by key once a pipeline stage needs them.
//
// This is a DIFFERENT credential from CLOUDFLARE_API_TOKEN (the Bearer token src/lib/cloudflare.js
// uses for D1/Vectorize REST calls) — R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY are S3-style
// credentials from a dedicated, account-owned R2 API token scoped to just the upload bucket.
// Deliberately never derived from or mixed with the D1/Vectorize token.
import { AwsClient } from 'aws4fetch';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const ENDPOINT = process.env.R2_ENDPOINT || (ACCOUNT_ID && `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`);

function assertConfigured() {
  if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME || !ENDPOINT) {
    throw new Error(
      'R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_ENDPOINT (or CLOUDFLARE_ACCOUNT_ID) must be set.'
    );
  }
}

let client;
function r2Client() {
  assertConfigured();
  if (!client) {
    // R2 ignores region but the S3 signing algorithm requires some value.
    client = new AwsClient({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
  }
  return client;
}

function objectUrl(key) {
  return `${ENDPOINT}/${BUCKET_NAME}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
}

// Signs a PUT URL the browser can upload straight to, so the bid-set bytes never pass through a
// Vercel function body. expiresIn is seconds (900 = 15 minutes — long enough for a 44MB upload
// on a slow connection, short enough that a stale link isn't a lingering write hole).
export async function createPresignedUploadUrl(key, { contentType = 'application/pdf', expiresIn = 900 } = {}) {
  const aws = r2Client();
  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(expiresIn));
  const signed = await aws.sign(
    new Request(url, { method: 'PUT', headers: { 'Content-Type': contentType } }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

// Server-side fetch of the raw bytes for a pipeline stage to hand to extraction/splitting.
export async function fetchObjectBytes(key) {
  const aws = r2Client();
  const signed = await aws.sign(new Request(objectUrl(key), { method: 'GET' }));
  const res = await fetch(signed);
  if (!res.ok) {
    throw new Error(`R2 fetch failed for key "${key}": ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// Direct server-side write, used by the test/round-trip script and available for any small
// server-originated writes; the browser upload path uses the presigned URL instead so bytes
// never transit a Vercel function.
export async function putObjectBytes(key, bytes, { contentType = 'application/pdf' } = {}) {
  const aws = r2Client();
  const res = await aws.fetch(objectUrl(key), { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes });
  if (!res.ok) {
    throw new Error(`R2 put failed for key "${key}": ${res.status} ${res.statusText}`);
  }
}

export async function deleteObject(key) {
  const aws = r2Client();
  const res = await aws.fetch(objectUrl(key), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed for key "${key}": ${res.status} ${res.statusText}`);
  }
}
