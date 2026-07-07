// Live round-trip test for the R2 upload path (web deployment step 2). Deliberately exercises
// the exact path the browser will take: get a presigned PUT URL, PUT bytes to it with a bare
// fetch (no SDK, no signing on the client side — proves the browser-upload story actually
// works), then fetch server-side by key and byte-compare. Cleans up after itself.
// Run: node --env-file=.cloudflare.env src/lib/test-r2.js
import { randomUUID } from 'node:crypto';
import { createPresignedUploadUrl, fetchObjectBytes, deleteObject } from './r2.js';

async function main() {
  const key = `test/${randomUUID()}.bin`;
  const payload = Buffer.from(`round-trip test ${new Date().toISOString()}`);

  console.log(`Signing PUT URL for key "${key}"...`);
  const uploadUrl = await createPresignedUploadUrl(key, { contentType: 'application/octet-stream', expiresIn: 300 });

  console.log('Uploading via plain fetch (simulating the browser, no SDK/signing client-side)...');
  const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: payload });
  if (!putRes.ok) throw new Error(`Presigned PUT failed: ${putRes.status} ${putRes.statusText} — ${await putRes.text()}`);
  console.log(`PUT succeeded (${putRes.status}).`);

  console.log('Fetching object bytes server-side by key...');
  const fetched = await fetchObjectBytes(key);
  if (!fetched.equals(payload)) {
    throw new Error(`Byte mismatch — wrote ${payload.length} bytes, read back ${fetched.length} bytes.`);
  }
  console.log(`Byte-for-byte match confirmed (${fetched.length} bytes).`);

  console.log('Cleaning up test object...');
  await deleteObject(key);
  console.log('Deleted. R2 presigned-upload + server-side-fetch round trip PASSED.');
}

main().catch((err) => {
  console.error('R2 round-trip test FAILED:', err.message);
  process.exit(1);
});
