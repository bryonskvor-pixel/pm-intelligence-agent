// POST /api/runs/[runId]/confirm — the PM confirmation gate. Optional body { perBrandCandidates }
// carries the PM's edits to the candidate sheet lists; confirmStage runs them through the real
// confirmManifest() validation and flips the run to "confirmed", which is the only status from
// which extraction may proceed. No PDF bytes needed — this stage is pure state.
import { confirmStage } from '../../../../../../src/pipeline/stages.js';
import { store } from '../../../../../lib/pipeline.js';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  try {
    const { runId } = await params;
    const { perBrandCandidates = null } = await request.json().catch(() => ({}));
    await confirmStage(store, runId, { perBrandCandidates });
    return Response.json({ runId, status: 'confirmed' });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
