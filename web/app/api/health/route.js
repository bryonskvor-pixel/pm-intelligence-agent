// Placeholder route proving the middleware gate covers API routes, not just pages. The real
// pipeline routes (plan/confirm/extract/specialist/finalize — thin wrappers over
// ../../src/pipeline/stages.js) land here in the next phase; this one exists purely so step 3
// has something to verify the gate against without pulling in pipeline/D1/R2 wiring yet.
export async function GET() {
  return Response.json({ status: 'ok', time: new Date().toISOString() });
}
