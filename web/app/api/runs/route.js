// POST /api/runs — create a run for an already-uploaded r2:<key> PDF and plan it (index-page
// extraction + triage, the only paid calls here). Returns the run id and the editable manifest
// the PM reviews before confirming. Plan is a short paid call; extraction/specialists/finalize
// happen later via the step route.
import { createRun, planStage } from '../../../../src/pipeline/stages.js';
import { store, loadPdfBytes } from '../../../lib/pipeline.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request) {
  try {
    const { pdfSource } = await request.json().catch(() => ({}));
    const pdfBytes = await loadPdfBytes(pdfSource);
    const run = await createRun(store, { pdfSource });
    const manifest = await planStage(store, run.runId, pdfBytes);
    return Response.json({
      runId: run.runId,
      status: 'awaiting_confirmation',
      perBrandCandidates: manifest.perBrandCandidates,
      perBrandReasoning: manifest.perBrandReasoning ?? {},
      unresolvedCandidates: manifest.unresolvedCandidates ?? [],
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
