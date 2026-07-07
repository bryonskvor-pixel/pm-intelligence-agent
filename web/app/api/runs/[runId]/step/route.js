// POST /api/runs/[runId]/step — advance the run by exactly one stage call (one extract chunk, or
// one brand specialist, or the finalize). The frontend calls this in a loop, re-fetching status
// between calls, until `more` is false. Each call re-fetches the PDF bytes from R2 (never cached
// across invocations, exactly like separate serverless invocations) and delegates to advanceRun —
// the same function the CLI driver uses, so there is no second copy of the "what runs next" logic.
//
// maxDuration is set high because a single specialist call (Claude, up to 4096 output tokens) can
// take a while; Vercel clamps this to the plan's ceiling (60s on Hobby, up to 300s on Pro).
import { advanceRun } from '../../../../../../src/pipeline/stages.js';
import { store, loadPdfBytes } from '../../../../../lib/pipeline.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request, { params }) {
  try {
    const { runId } = await params;
    const run = await store.getRun(runId);
    if (!run) return Response.json({ error: 'run not found' }, { status: 404 });

    // The finalize stage is the only one that doesn't need bytes, but every other step does, and
    // fetching once here keeps the route uniform; R2 GET of a ~44MB object is quick.
    const pdfBytes = await loadPdfBytes(run.pdfSource);
    const { phase, status, more, detail } = await advanceRun(store, runId, pdfBytes);

    // The finalize detail carries the full report markdown; the frontend reads that via the status
    // route instead, so strip it here to keep the step response small.
    const { reportMarkdown, ...leanDetail } = detail || {};
    return Response.json({ runId, phase, status, more, detail: leanDetail });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
