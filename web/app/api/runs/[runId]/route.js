// GET /api/runs/[runId] — the poll endpoint. Reads persisted run state (no API calls, free) and
// returns just what the frontend renders: status, progress derived from persisted rows, the
// editable manifest while awaiting confirmation, and the rendered report markdown once complete.
// Large blobs (the manifest's index-sheet rawText, the full report JSON) are deliberately not
// shipped — only the report markdown, and only when it exists.
import { store } from '../../../../lib/pipeline.js';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const { runId } = await params;
    const run = await store.getRun(runId);
    if (!run) return Response.json({ error: 'run not found' }, { status: 404 });

    const sheets = await store.listSheets(runId);
    const specialists = await store.listSpecialists(runId);

    return Response.json({
      runId: run.runId,
      status: run.status,
      error: run.error,
      pdfSource: run.pdfSource,
      sheetsExtracted: sheets.length,
      specialists: specialists.map((s) => ({ brand: s.brand, status: s.status })),
      // The PM-editable manifest, only while it's the thing being reviewed.
      manifest:
        run.status === 'awaiting_confirmation' && run.manifest
          ? {
              perBrandCandidates: run.manifest.perBrandCandidates,
              perBrandReasoning: run.manifest.perBrandReasoning ?? {},
              unresolvedCandidates: run.manifest.unresolvedCandidates ?? [],
            }
          : null,
      reportMarkdown: run.status === 'complete' ? run.reportMarkdown : null,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
