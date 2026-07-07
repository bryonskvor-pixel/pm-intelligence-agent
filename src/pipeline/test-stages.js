// Free deterministic tests for the stage-based pipeline (src/pipeline/stages.js) against the
// in-memory run store. No API calls, no env needed: the paid boundaries (planPipeline,
// extractSheetsFromPdf, specialist runners, the reconciler) are injected fakes; everything
// else — status gate, resumable extraction cursor, specialist seeding, report assembly and
// render — is the real code. Run: npm run test:stages
import assert from 'node:assert';
import { memoryRunStore } from '../store/runStore.js';
import { buildManifest } from './runFromPdf.js';
import {
  createRun,
  planStage,
  confirmStage,
  extractStage,
  specialistStage,
  finalizeStage,
} from './stages.js';

let passed = 0;
function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`PASS: ${label}`);
    })
    .catch((err) => {
      console.error(`FAIL: ${label} — ${err.message}`);
      process.exitCode = 1;
    });
}

const fakeUsage = { callCount: 1, inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };

const indexSheet = {
  pageIndex: 0,
  sheetNumber: 'G-001',
  title: 'SHEET INDEX',
  discipline: 'General',
  rawText: 'SHEET INDEX: A-101 FLOOR PLAN, S-201 STRUCTURAL FRAMING, M-301 MECHANICAL PLAN',
};

const fakeTriageResult = {
  orderedSheetNumbers: ['A-101', 'S-201', 'M-301'],
  Skyfold: { candidateSheetNumbers: ['A-101', 'S-201'], reasoning: 'operable wall on plan; structural support sheet' },
};

// Physical layout: page 0 = index, pages 1-3 = A-101, S-201, M-301 (pageOffset 1).
const PAGE_SHEETS = {
  1: { pageIndex: 1, sheetNumber: 'A-101', title: 'FLOOR PLAN', discipline: 'Architectural', rawText: 'SKYFOLD ZENITH 60 OPERABLE WALL, SEE S-201 FOR SUPPORT', crossReferences: [{ targetSheet: 'S-201' }] },
  2: { pageIndex: 2, sheetNumber: 'S-201', title: 'STRUCTURAL FRAMING', discipline: 'Structural', rawText: 'W8X10 BEAM AT GRID C, L/240 DEFLECTION' },
  3: { pageIndex: 3, sheetNumber: 'M-301', title: 'MECHANICAL PLAN', discipline: 'Mechanical', rawText: 'SUPPLY DUCT ROUTING AT CEILING PLENUM' },
};

const fakePlanFn = async () =>
  buildManifest({
    indexPageIndex: 0,
    triageResult: fakeTriageResult,
    indexSheet,
    planUsage: { index: fakeUsage, triage: fakeUsage },
  });

const extractCalls = [];
const fakeExtractFn = async (pdfBytes, { pageIndices }) => {
  extractCalls.push([...pageIndices]);
  return { sheets: pageIndices.map((p) => PAGE_SHEETS[p]).filter(Boolean), usage: fakeUsage };
};

const fakeSkyfoldRun = async (brandInput) => ({
  sheetsProcessed: brandInput.map((s) => s.sheetNumber),
  pdfPagesAttached: [],
  modelIdsDetected: ['SKYFOLD-ZENITH'],
  paramsUsed: [],
  requiredConditionsUsed: [],
  semanticMatches: [],
  findings: [
    {
      finding_type: 'risk',
      evidence_type: 'TEXT_READ',
      description: 'Structural deflection criteria stated as L/240 only; Skyfold requires absolute limits.',
      sheet_reference: 'S-201',
      citation: 'S-201 general notes',
    },
  ],
  guardWarnings: [],
});

const fakeReconcileFn = async ({ findings }) => ({
  findings,
  reconciliation: { contradictions: [], corroborations: [], escalations: [], culled: [], derivedValueFlags: [], rfis: [] },
  usage: fakeUsage,
});

const store = memoryRunStore();
const pdfBytes = Buffer.from('not a real pdf — never touched by the fakes');

async function main() {
  const run = await createRun(store, { pdfSource: 'fake.pdf' });
  const runId = run.runId;

  await check('createRun starts at status "created"', async () => {
    assert.equal(run.status, 'created');
    assert.ok(runId);
  });

  await check('gate: extractStage refuses a run that has not been confirmed', async () => {
    await assert.rejects(() => extractStage(store, runId, pdfBytes, { extractFn: fakeExtractFn }), /expected confirmed or extracting/);
  });

  await check('gate: confirmStage refuses a run that has not been planned', async () => {
    await assert.rejects(() => confirmStage(store, runId), /expected awaiting_confirmation/);
  });

  await check('planStage persists manifest + index sheet, status awaiting_confirmation', async () => {
    await planStage(store, runId, pdfBytes, { planFn: fakePlanFn });
    const r = await store.getRun(runId);
    assert.equal(r.status, 'awaiting_confirmation');
    assert.deepEqual(r.manifest.perBrandCandidates.Skyfold, ['A-101', 'S-201']);
    const sheets = await store.listSheets(runId);
    assert.equal(sheets.length, 1);
    assert.equal(sheets[0].sheet.sheetNumber, 'G-001');
  });

  await check('gate: forging status by hand still cannot produce a confirmed manifest', async () => {
    // A caller with store access can flip the status column, but without confirmStage there is
    // no confirmed_manifest_json — execution has nothing to resolve selections from.
    const r = await store.getRun(runId);
    assert.equal(r.confirmedManifest, null);
  });

  await check('confirmStage applies PM edits (add M-301 and unknown X-999 to Skyfold)', async () => {
    const confirmed = await confirmStage(store, runId, {
      perBrandCandidates: { Skyfold: ['A-101', 'S-201', 'M-301', 'X-999'] },
    });
    assert.deepEqual([...confirmed.perBrandCandidates.Skyfold], ['A-101', 'S-201', 'M-301', 'X-999']);
    const r = await store.getRun(runId);
    assert.equal(r.status, 'confirmed');
    assert.deepEqual(r.confirmedManifest.perBrandCandidates.Skyfold, ['A-101', 'S-201', 'M-301', 'X-999']);
  });

  await check('extractStage chunk 1: extracts only the first pending page', async () => {
    const res = await extractStage(store, runId, pdfBytes, { chunkSize: 1, extractFn: fakeExtractFn });
    assert.equal(res.done, false);
    assert.deepEqual(res.extractedPages, [1]);
    assert.equal(res.remainingPages, 2);
  });

  await check('resume: next extractStage call continues from persisted rows, never re-extracts', async () => {
    // Simulates the kill-and-resume path: state lives only in the store, so a fresh invocation
    // (same store, new call) picks up at page 2. The fake records every requested page.
    const res = await extractStage(store, runId, pdfBytes, { chunkSize: 2, extractFn: fakeExtractFn });
    assert.equal(res.done, false);
    assert.deepEqual(res.extractedPages, [2, 3]);
    const allRequested = extractCalls.flat();
    assert.deepEqual(allRequested, [1, 2, 3], 'no page requested twice');
  });

  await check('extractStage completion: seeds firing specialists, status synthesizing', async () => {
    const res = await extractStage(store, runId, pdfBytes, { extractFn: fakeExtractFn });
    assert.equal(res.done, true);
    assert.deepEqual(res.firingBrands, ['Skyfold']);
    const r = await store.getRun(runId);
    assert.equal(r.status, 'synthesizing');
    const specialists = await store.listSpecialists(runId);
    assert.deepEqual(specialists.map((s) => [s.brand, s.status]), [['Skyfold', 'pending']]);
  });

  await check('specialistStage refuses a brand routing never seeded', async () => {
    await assert.rejects(() => specialistStage(store, runId, 'Airolite', null), /was not seeded/);
  });

  await check('specialistStage runs the brand with role-tagged full set, persists result', async () => {
    const res = await specialistStage(store, runId, 'Skyfold', null, { runFn: fakeSkyfoldRun });
    assert.equal(res.alreadyDone, false);
    // Primary: keyword sheet (A-101) + confirmed candidates (S-201, M-301). Context: index sheet.
    assert.deepEqual(res.result.primarySheets.sort(), ['A-101', 'M-301', 'S-201']);
    assert.deepEqual(res.result.contextSheets, ['G-001']);
    const specialists = await store.listSpecialists(runId);
    assert.equal(specialists[0].status, 'done');
    assert.equal(specialists[0].result.result.findings.length, 1);
  });

  await check('specialistStage is idempotent once done', async () => {
    const res = await specialistStage(store, runId, 'Skyfold', null, { runFn: fakeSkyfoldRun });
    assert.equal(res.alreadyDone, true);
  });

  await check('finalizeStage assembles the report, renders markdown, completes the run', async () => {
    const result = await finalizeStage(store, runId, { reconcileFn: fakeReconcileFn, projectName: 'Stage Test' });
    const r = await store.getRun(runId);
    assert.equal(r.status, 'complete');
    assert.ok(r.report, 'report persisted');
    assert.ok(r.reportMarkdown.includes("What the Drawings Don't Show"), 'package section rendered');
    assert.equal(result.report.sections[0].key, 'whats_not_shown');
    // The PM-added unknown sheet surfaces as unresolved, not silently dropped.
    assert.deepEqual(result.triage.unresolvedCandidates, ['X-999']);
    const unresolvedSection = result.report.sections.find((s) => s.key === 'unresolved');
    assert.deepEqual(unresolvedSection.unresolved.unresolvedTriageCandidates, ['X-999']);
    // Usage accumulated across plan + the 2 paid extraction chunks (the third extractStage call
    // extracted nothing — it only flipped the run to synthesizing).
    assert.equal(result.usage.extraction.callCount, 2);
    assert.equal(result.usage.plan.callCount, 2);
  });

  await check('finalizeStage refuses to run twice (run already complete)', async () => {
    await assert.rejects(() => finalizeStage(store, runId, { reconcileFn: fakeReconcileFn }), /expected synthesizing/);
  });

  await check('finalizeStage refuses while specialists are pending', async () => {
    const run2 = await createRun(store, { pdfSource: 'fake2.pdf' });
    await planStage(store, run2.runId, pdfBytes, { planFn: fakePlanFn });
    await confirmStage(store, run2.runId);
    let res;
    do {
      res = await extractStage(store, run2.runId, pdfBytes, { extractFn: fakeExtractFn });
    } while (!res.done);
    await assert.rejects(() => finalizeStage(store, run2.runId, { reconcileFn: fakeReconcileFn }), /still pending: Skyfold/);
  });

  await check('size guard: oversized value fails loudly instead of writing', async () => {
    const run3 = await createRun(store, { pdfSource: 'fake3.pdf' });
    await assert.rejects(
      () => store.putSheet(run3.runId, 0, { sheetNumber: 'A-1', rawText: 'x'.repeat(800_000) }),
      /D1 value guard/
    );
  });

  console.log(`\n${passed} check(s) passed${process.exitCode ? ' — WITH FAILURES ABOVE' : ''}`);
}

main().catch((err) => {
  console.error('test-stages crashed:', err);
  process.exit(1);
});
