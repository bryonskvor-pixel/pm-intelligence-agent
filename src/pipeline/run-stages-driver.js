// CLI driver for the stage-based pipeline against the REAL D1 run store — the local stand-in
// for the future web API: each subcommand corresponds to what will be one API route, each step
// is one short stateful call, and every bit of run state round-trips through D1 between calls
// (nothing is held in process memory across invocations — kill it anywhere and resume).
//
// The PDF source is either a local path or an R2 object key prefixed "r2:" — every command that
// needs bytes resolves through loadPdfBytes, so the same commands work whether bytes live on
// disk (local dev) or in R2 (the real upload path, once the frontend exists). A stage call never
// caches these bytes between invocations — each one re-fetches, exactly like separate Vercel
// function invocations would.
//
//   npm run stages:run -- upload <localPdf> [key]        PUT a local file to R2, print "r2:<key>"
//   npm run stages:run -- plan "<pdf-or-r2:key>"          create a run + plan it, print the manifest
//   npm run stages:run -- confirm <runId>                  confirm the manifest unedited
//   npm run stages:run -- confirm <runId> edits.json       confirm with edited perBrandCandidates
//   npm run stages:run -- step <runId> "<pdf-or-r2:key>"   advance exactly one stage call
//   npm run stages:run -- auto <runId> "<pdf-or-r2:key>" [maxSteps]   loop step until complete (or cap)
//   npm run stages:run -- status <runId>                   print persisted run state, no API calls
//
// On completion the persisted markdown is written to pipeline_report.md (gitignored).
import fs from 'fs';
import { d1RunStore } from '../store/runStore.js';
import { fetchObjectBytes, putObjectBytes } from '../lib/r2.js';
import {
  createRun,
  planStage,
  confirmStage,
  advanceRun,
} from './stages.js';

const KNOWLEDGE_DB_ID = '305c2b6e-3c25-4ac1-b9f6-39ad23422c8d';
const store = d1RunStore({ databaseId: KNOWLEDGE_DB_ID });

const [command, arg1, arg2, arg3] = process.argv.slice(2);

const R2_PREFIX = 'r2:';

async function loadPdfBytes(source) {
  if (!source) throw new Error('This command needs a PDF path or "r2:<key>".');
  if (source.startsWith(R2_PREFIX)) {
    const key = source.slice(R2_PREFIX.length);
    console.log(`[r2] fetching s3://${key} ...`);
    return fetchObjectBytes(key);
  }
  return fs.readFileSync(source);
}

async function printStatus(runId) {
  const run = await store.getRun(runId);
  if (!run) throw new Error(`No run ${runId}`);
  const sheets = await store.listSheets(runId);
  const specialists = await store.listSpecialists(runId);
  console.log(`run ${run.runId}`);
  console.log(`  status: ${run.status}`);
  console.log(`  pdf: ${run.pdfSource}`);
  console.log(`  sheets persisted: ${sheets.length} (pages ${sheets.map((s) => s.pageIndex).join(', ') || '—'})`);
  console.log(`  specialists: ${specialists.map((s) => `${s.brand}:${s.status}`).join(', ') || '(not seeded yet)'}`);
  if (run.error) console.log(`  last error: ${run.error}`);
  if (run.status === 'awaiting_confirmation') {
    console.log('  manifest candidates:');
    for (const [brand, list] of Object.entries(run.manifest.perBrandCandidates)) {
      console.log(`    ${brand}: ${list.join(', ') || '(none)'}`);
    }
  }
  return run;
}

// One stage call via the shared advanceRun (the same function the web API's step route calls),
// narrated for the CLI. Returns advanceRun's `more` flag: true while the run can keep advancing
// automatically, false when it stops (gate, awaiting confirmation, or complete). pdfBytes is
// re-resolved by the caller before every call (see loadPdfBytes) — never cached across steps.
async function step(runId, pdfBytes) {
  const { phase, detail, more } = await advanceRun(store, runId, pdfBytes);
  switch (phase) {
    case 'plan':
      console.log('[step] planStage done — review with "status", then "confirm".');
      break;
    case 'awaiting_confirmation':
      console.log('[step] waiting on PM confirmation — run the "confirm" command.');
      break;
    case 'extract':
      console.log(
        detail.done
          ? `[step] extraction complete — specialists seeded: ${detail.firingBrands.join(', ')}`
          : `[step] extracted pages ${detail.extractedPages.join(', ')} — ${detail.remainingPages} page(s) remaining`
      );
      break;
    case 'specialist':
      console.log(`[step] specialist ${detail.brand} done (${detail.pending} were pending).`);
      break;
    case 'finalize':
      fs.writeFileSync('pipeline_report.md', detail.reportMarkdown);
      console.log('[step] run complete — report written to pipeline_report.md');
      break;
    case 'complete':
      console.log('[step] run already complete.');
      break;
  }
  return more;
}

async function main() {
  switch (command) {
    case 'upload': {
      const localPath = arg1;
      if (!localPath) throw new Error('upload requires a local PDF path.');
      const key = arg2 || `uploads/${Date.now()}-${localPath.split(/[\\/]/).pop()}`;
      const bytes = fs.readFileSync(localPath);
      console.log(`Uploading ${localPath} (${(bytes.length / 1024 / 1024).toFixed(1)} MB) to s3://${key} ...`);
      await putObjectBytes(key, bytes);
      console.log(`Uploaded. Use as PDF source: ${R2_PREFIX}${key}`);
      break;
    }
    case 'plan': {
      const source = arg1;
      const pdfBytes = await loadPdfBytes(source);
      const run = await createRun(store, { pdfSource: source });
      console.log(`created run ${run.runId}`);
      await planStage(store, run.runId, pdfBytes);
      await printStatus(run.runId);
      break;
    }
    case 'confirm': {
      const edits = arg2 ? { perBrandCandidates: JSON.parse(fs.readFileSync(arg2, 'utf8')) } : {};
      await confirmStage(store, arg1, edits);
      console.log(`run ${arg1} confirmed${arg2 ? ' with edits from ' + arg2 : ' (unedited)'}.`);
      break;
    }
    case 'step': {
      await step(arg1, await loadPdfBytes(arg2));
      break;
    }
    case 'auto': {
      const pdfBytes = await loadPdfBytes(arg2);
      const maxSteps = arg3 ? parseInt(arg3, 10) : Infinity;
      let steps = 0;
      while (steps < maxSteps && (await step(arg1, pdfBytes))) steps += 1;
      if (steps >= maxSteps) console.log(`[auto] stopped after ${steps} step(s) (cap hit) — resume with "auto" again.`);
      break;
    }
    case 'status': {
      await printStatus(arg1);
      break;
    }
    default:
      console.error('Usage: upload <localPdf> [key] | plan <pdf-or-r2:key> | confirm <runId> [edits.json] | step <runId> <pdf-or-r2:key> | auto <runId> <pdf-or-r2:key> [maxSteps] | status <runId>');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Driver failed:', err.message);
  process.exit(1);
});
