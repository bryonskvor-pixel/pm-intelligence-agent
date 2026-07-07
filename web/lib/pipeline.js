// Shared server-only wiring for the pipeline API routes. Constructs the one real D1-backed run
// store and resolves PDF bytes from R2 by key. Every API route goes through here so the D1
// database id and the r2:<key> convention live in exactly one place. Imports reach up into the
// repo-root pipeline library (../../src/**) — see next.config.js's outputFileTracingRoot, which
// is what gets these files bundled into the deployed serverless functions.
import { d1RunStore } from '../../src/store/runStore.js';
import { fetchObjectBytes } from '../../src/lib/r2.js';

// pm-intel-knowledge — same id the CLI driver uses; not secret, so hardcoded rather than an env var.
const KNOWLEDGE_DB_ID = '305c2b6e-3c25-4ac1-b9f6-39ad23422c8d';

export const store = d1RunStore({ databaseId: KNOWLEDGE_DB_ID });

const R2_PREFIX = 'r2:';

// In the web flow a run's pdfSource is always an r2:<key> — the browser uploaded straight to R2
// via a presigned URL and the stages fetch bytes back by key. Local disk paths (the CLI's other
// mode) are meaningless on Vercel and rejected rather than silently mis-handled.
export async function loadPdfBytes(source) {
  if (!source || !source.startsWith(R2_PREFIX)) {
    throw new Error(`Expected an r2:<key> pdf source, got: ${source ?? '(none)'}`);
  }
  return fetchObjectBytes(source.slice(R2_PREFIX.length));
}

export { R2_PREFIX };
