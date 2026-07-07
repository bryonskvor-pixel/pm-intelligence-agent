// Stage-based pipeline (web deployment step 1). The same plan → confirm → execute flow as
// runFromPdf.js, broken into short calls that each read/write run state through a runStore
// (src/store/runStore.js) instead of holding it in memory — because a full run takes many
// minutes and a Vercel function invocation does not. Each stage is sized to one agent call
// (the "one-agent-per-call architecture"): plan, then one extraction chunk per call, then one
// brand specialist per call, then one finalize (reconciler + deterministic sectioning/render).
//
// Progress is derived from persisted rows, never from a counter: extraction's "cursor" is the
// set difference between the confirmed manifest's page list and the run_sheets rows already
// written, so a crashed or killed invocation resumes exactly where the persisted work ends —
// nothing already paid for is ever re-bought.
//
// Pipeline logic lives where it always did (runFromPdf.js, report.js, the specialists); this
// file only orchestrates. The PM confirmation gate survives serialization as a status
// transition: execution stages require a status only confirmStage sets, and confirmStage runs
// the manifest through the real confirmManifest() validation first. PDF bytes are passed into
// each stage by the caller (disk today, R2 fetch in the web API later) — they are never
// persisted in D1.
import { randomUUID } from 'node:crypto';
import {
  planPipeline,
  confirmManifest,
  resolveManifestSelections,
  computeOrderingMismatches,
} from './runFromPdf.js';
import { extractSheetsFromPdf, sumUsageStages, estimateCostUSD } from '../lib/extraction.js';
import { splitPdfIntoPages } from '../lib/pdfSplit.js';
import { findMissingCrossReferences } from '../lib/gapCheck.js';
import { routeSheets, assembleReport, BRANDS } from '../synthesis/report.js';
import { renderReportMarkdown } from '../render/renderMarkdown.js';

// How many candidate pages one extractStage call attempts. Small on purpose: the truncation-
// recovery inside extractSheetsFromPdf can multiply one chunk into several API calls, and the
// whole chunk must fit comfortably inside one serverless invocation's time budget.
const DEFAULT_EXTRACT_CHUNK_SIZE = 3;

function requireStatus(run, allowed, stage) {
  if (!run) throw new Error(`${stage}: run not found.`);
  if (!allowed.includes(run.status)) {
    throw new Error(`${stage}: run ${run.runId} is "${run.status}" — expected ${allowed.join(' or ')}.`);
  }
}

// Sums numeric usage fields across chunk calls. Non-numeric fields (extraction's per-call
// detail array, for one) have no meaningful cross-chunk merge and are dropped rather than
// concatenated into garbage.
function mergeUsage(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = {};
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' || typeof bv === 'number') {
      out[key] = (typeof av === 'number' ? av : 0) + (typeof bv === 'number' ? bv : 0);
    }
  }
  return out;
}

// Rebuild everything the routing/synthesis side consumes from persisted state. Deterministic
// and free — routing is recomputed per call rather than persisted, so it can never drift from
// the sheets actually on record.
async function loadSynthesisState(store, run) {
  const manifest = run.confirmedManifest;
  const selections = resolveManifestSelections(manifest);
  const rows = await store.listSheets(run.runId);
  const candidateSheets = rows.map((r) => r.sheet);
  const synthesisSheets = candidateSheets
    .filter((s) => s.sheetNumber)
    .map((s) => ({ sheetNumber: s.sheetNumber, revision: s.revision, text: s.rawText, pageIndex: s.pageIndex }));
  const routing = routeSheets(synthesisSheets, { triageCandidates: selections.triageCandidates });
  const firingBrands = BRANDS.filter((b) => routing.brandSheets.get(b.name).length > 0).map((b) => b.name);
  return { manifest, selections, candidateSheets, synthesisSheets, routing, firingBrands };
}

export async function createRun(store, { pdfSource = null, indexPageIndex = 0 } = {}) {
  return store.createRun({ runId: randomUUID(), pdfSource, indexPageIndex });
}

// Stage: plan. Wraps planPipeline (index-page extraction + triage — the only paid calls),
// persists the manifest for PM review. The index sheet is also written to run_sheets here so
// execution never re-extracts it.
export async function planStage(store, runId, pdfBytes, { planFn = planPipeline } = {}) {
  const run = await store.getRun(runId);
  requireStatus(run, ['created', 'planning'], 'planStage'); // 'planning' = retry after a failed attempt
  await store.updateRun(runId, { status: 'planning', error: null });
  try {
    const manifest = await planFn(pdfBytes, { indexPageIndex: run.indexPageIndex ?? 0 });
    await store.putSheet(runId, manifest.indexPageIndex, manifest.indexSheet);
    await store.updateRun(runId, {
      status: 'awaiting_confirmation',
      manifest,
      usage: { plan: sumUsageStages(manifest.planUsage) },
    });
    return manifest;
  } catch (err) {
    await store.updateRun(runId, { error: `planStage: ${err.message}` });
    throw err;
  }
}

// Stage: confirm. The PM's (possibly edited) per-brand candidate lists go through the real
// confirmManifest() validation, then the snapshot is persisted and the status transition —
// which only this stage performs — becomes the serialization-safe form of the gate.
export async function confirmStage(store, runId, { perBrandCandidates = null } = {}) {
  const run = await store.getRun(runId);
  requireStatus(run, ['awaiting_confirmation'], 'confirmStage');
  const edited = perBrandCandidates
    ? { ...run.manifest, perBrandCandidates: { ...run.manifest.perBrandCandidates, ...perBrandCandidates } }
    : run.manifest;
  const confirmed = confirmManifest(edited); // validates + freezes; the Symbol marker doesn't survive JSON, the status below is its persisted equivalent
  await store.updateRun(runId, { status: 'confirmed', confirmedManifest: confirmed, error: null });
  return confirmed;
}

// Stage: extract one chunk. Call repeatedly until { done: true }. Progress derives from
// run_sheets rows, so a killed invocation resumes with zero re-paid extraction.
export async function extractStage(
  store,
  runId,
  pdfBytes,
  { chunkSize = DEFAULT_EXTRACT_CHUNK_SIZE, extractFn = extractSheetsFromPdf } = {}
) {
  const run = await store.getRun(runId);
  requireStatus(run, ['confirmed', 'extracting'], 'extractStage');

  const selections = resolveManifestSelections(run.confirmedManifest);
  const done = new Set((await store.listSheets(runId)).map((r) => r.pageIndex));
  const remaining = selections.pagesToExtract.filter((p) => !done.has(p));

  if (!remaining.length) {
    const { firingBrands } = await loadSynthesisState(store, run);
    await store.seedSpecialists(runId, firingBrands);
    await store.updateRun(runId, { status: 'synthesizing', error: null });
    return { done: true, firingBrands, extractedPages: [], remainingPages: 0 };
  }

  await store.updateRun(runId, { status: 'extracting', error: null });
  const chunk = remaining.slice(0, chunkSize);
  try {
    const { sheets, usage } = await extractFn(pdfBytes, { pageIndices: chunk });
    for (const sheet of sheets) {
      if (sheet.pageIndex == null) {
        throw new Error('extractStage: extracted sheet is missing pageIndex — cannot persist resumable state.');
      }
      await store.putSheet(runId, sheet.pageIndex, sheet);
    }
    // A page the extractor returned nothing for must not stall the cursor forever — record a
    // stub row so the run can proceed with the gap visible rather than looping on the same page.
    for (const pageIndex of chunk) {
      if (!sheets.some((s) => s.pageIndex === pageIndex)) {
        await store.putSheet(runId, pageIndex, {
          pageIndex,
          sheetNumber: null,
          rawText: null,
          extractionWarnings: [{ type: 'no_extraction_result', detail: 'Extractor returned no sheet for this page.' }],
        });
      }
    }
    const priorUsage = (await store.getRun(runId)).usage || {};
    await store.updateRun(runId, {
      usage: { ...priorUsage, extraction: mergeUsage(priorUsage.extraction, usage) },
    });
    return { done: false, extractedPages: chunk, remainingPages: remaining.length - chunk.length };
  } catch (err) {
    await store.updateRun(runId, { error: `extractStage (pages ${chunk.join(',')}): ${err.message}` });
    throw err;
  }
}

// Stage: one brand specialist. Routing is recomputed (free, deterministic) from persisted
// sheets; the specialist gets the full role-tagged set plus its original single-page PDFs
// (re-split locally from the source bytes — never persisted).
export async function specialistStage(store, runId, brand, pdfBytes, { runFn = null } = {}) {
  const run = await store.getRun(runId);
  requireStatus(run, ['synthesizing'], 'specialistStage');

  const seeded = (await store.listSpecialists(runId)).find((s) => s.brand === brand);
  if (!seeded) throw new Error(`specialistStage: "${brand}" was not seeded for run ${runId} — routing did not fire it.`);
  if (seeded.status === 'done') return { brand, alreadyDone: true, result: seeded.result };

  const { routing, synthesisSheets } = await loadSynthesisState(store, run);
  const brandDef = BRANDS.find((b) => b.name === brand);
  if (!brandDef) throw new Error(`specialistStage: unknown brand "${brand}".`);

  let brandInput = routing.brandSheets.get(brand);
  if (!brandInput.length) throw new Error(`specialistStage: routing produced no sheets for "${brand}".`);

  if (pdfBytes) {
    const pageBytesByIndex = await splitPdfIntoPages(pdfBytes);
    const pageIndexBySheet = new Map(synthesisSheets.map((s) => [s.sheetNumber, s.pageIndex]));
    brandInput = brandInput.map((s) => {
      const pageIndex = pageIndexBySheet.get(s.sheetNumber);
      return { ...s, pageBytes: pageIndex != null ? pageBytesByIndex[pageIndex] : undefined };
    });
  }

  try {
    const result = await (runFn || brandDef.run)(brandInput);
    const record = {
      brand,
      primarySheets: brandInput.filter((s) => s.role === 'primary').map((s) => s.sheetNumber),
      contextSheets: brandInput.filter((s) => s.role === 'context').map((s) => s.sheetNumber),
      result,
    };
    await store.putSpecialistResult(runId, brand, record);
    return { brand, alreadyDone: false, result: record };
  } catch (err) {
    await store.updateRun(runId, { error: `specialistStage (${brand}): ${err.message}` });
    throw err;
  }
}

// Stage: finalize. Requires every seeded specialist done. One reconciler call inside
// assembleReport, then deterministic sectioning + markdown render; persists both and the run
// is complete. Returns the same result shape executePipeline returns.
export async function finalizeStage(store, runId, { reconcileFn = undefined, projectName = null } = {}) {
  const run = await store.getRun(runId);
  requireStatus(run, ['synthesizing'], 'finalizeStage');

  const specialists = await store.listSpecialists(runId);
  const pending = specialists.filter((s) => s.status !== 'done').map((s) => s.brand);
  if (pending.length) throw new Error(`finalizeStage: specialists still pending: ${pending.join(', ')}.`);

  const { manifest, selections, candidateSheets, synthesisSheets, routing } = await loadSynthesisState(store, run);

  const orderingMismatches = computeOrderingMismatches(candidateSheets, {
    orderedSheetNumbers: manifest.orderedSheetNumbers,
    pageOffset: manifest.pageOffset,
    indexPageIndex: manifest.indexPageIndex,
  });
  const { gaps, excludedNonSheetReferences } = findMissingCrossReferences(candidateSheets);
  const extractionWarnings = candidateSheets.flatMap((s) =>
    (s.extractionWarnings || []).map((w) => ({ sheetNumber: s.sheetNumber, pageIndex: s.pageIndex, ...w }))
  );
  const sheetInventory = candidateSheets
    .filter((s) => s.sheetNumber)
    .map((s) => ({ sheetNumber: s.sheetNumber, title: s.title ?? null, discipline: s.discipline ?? null }));

  try {
    const report = await assembleReport({
      specialistResults: specialists.map((s) => s.result),
      routing,
      sheetInventory,
      gapCheck: { gaps },
      unresolvedCandidates: selections.unresolvedCandidates,
      orderingMismatches,
      ...(reconcileFn ? { reconcileFn } : {}),
    });

    const perBrand = {};
    for (const brandDef of BRANDS) {
      perBrand[brandDef.name] = {
        candidateSheetNumbers: selections.triageCandidates[brandDef.name],
        reasoning: manifest.perBrandReasoning?.[brandDef.name] ?? null,
      };
    }
    const result = {
      report,
      triage: { perBrand, unresolvedCandidates: selections.unresolvedCandidates, pageOffset: manifest.pageOffset },
      orderingMismatches,
      gapCheck: { gaps, excludedNonSheetReferences },
      extractionWarnings,
      pagesExtracted: candidateSheets.map((s) => s.pageIndex).filter((p) => p != null).sort((a, b) => a - b),
      usage: run.usage,
    };

    const totals = sumUsageStages(run.usage || {});
    const markdown = renderReportMarkdown(report, {
      projectName: projectName || run.pdfSource || runId,
      generatedAt: new Date().toDateString(),
      diagnostics: {
        pagesExtracted: result.pagesExtracted,
        triage: result.triage,
        orderingMismatches,
        gapCheck: result.gapCheck,
        extractionWarnings,
        usageTotals: { ...totals, estimatedCostUSD: estimateCostUSD(totals) },
      },
    });

    await store.updateRun(runId, { status: 'complete', report: result, reportMarkdown: markdown, error: null });
    return { ...result, reportMarkdown: markdown };
  } catch (err) {
    await store.updateRun(runId, { error: `finalizeStage: ${err.message}` });
    throw err;
  }
}
