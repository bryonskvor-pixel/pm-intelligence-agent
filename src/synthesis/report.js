import { detectModelIds as detectModernfold, runModernfoldSpecialist } from '../specialists/modernfold.js';
import { detectModelIds as detectSkyfold, runSkyfoldSpecialist } from '../specialists/skyfold.js';
import { detectModelIds as detectEuroWall, runEuroWallSpecialist } from '../specialists/euro-wall.js';
import { detectModelIds as detectAirolite, runAiroliteSpecialist } from '../specialists/airolite.js';
import { detectModelIds as detectSmokeGuard, runSmokeGuardSpecialist } from '../specialists/smoke-guard.js';
import { normalizeSheetNumber } from '../lib/sheetNumber.js';
import { reconcileFindings } from './reconcile.js';

const BRANDS = [
  { name: 'Modernfold', detect: detectModernfold, run: runModernfoldSpecialist },
  { name: 'Skyfold', detect: detectSkyfold, run: runSkyfoldSpecialist },
  { name: 'Euro-Wall', detect: detectEuroWall, run: runEuroWallSpecialist },
  { name: 'Airolite', detect: detectAirolite, run: runAiroliteSpecialist },
  { name: 'Smoke Guard', detect: detectSmokeGuard, run: runSmokeGuardSpecialist },
];

// Phase 4 (Remediation Work Order): the report is a bid qualification package. Sections 1-6 and
// their order are contractual — the rendered report must OPEN with them in exactly this order.
// Estimating Flags and Critical Path / Lag are bid-time content the work order's section list
// doesn't place; they render after the six-section package (before the Brand Appendix) so no
// finding is lost, without disturbing the mandated opening order.
export const REPORT_SECTIONS = [
  { key: 'whats_not_shown', title: "What the Drawings Don't Show" },
  { key: 'rfi_list', title: 'RFI List (before pricing)' },
  { key: 'qualification', title: 'Proposal Qualifications' },
  { key: 'field_verification', title: 'Field Verification List' },
  { key: 'risk_register', title: 'Risk Register' },
  { key: 'unresolved', title: 'Unresolved Items' },
  { key: 'estimating_flag', title: 'Estimating Flags' },
  { key: 'critical_path', title: 'Critical Path / Lag' },
];

// Install-phase value, not bid-time — rendered as appendix sections so they don't crowd the
// qualification package (work order Phase 4).
export const APPENDIX_SECTIONS = [
  { key: 'preconstruction_checklist', title: 'Preconstruction Checklist' },
  { key: 'installation_briefing', title: 'Installation Briefing' },
];

// Routing decides WHICH SPECIALISTS FIRE, not which sheets each specialist sees. A specialist
// fires if (a) any sheet keyword-matches its models/brand, OR (b) triage listed candidate sheets
// for that brand — both signals OR'd, so triage's judgment (which correctly flags structural
// sheets for Skyfold, M sheets for Airolite, FA sheets for Smoke Guard even when no sheet names
// the brand) survives into routing instead of being discarded after page selection.
//
// Every specialist that fires receives ALL extracted sheets, each tagged role "primary" (keyword
// match or triage candidate for that brand) or "context" (everything else). The product's
// requirements routinely hide on sheets that never mention it — a structural sheet that never
// says "ZENITH" is exactly where the Skyfold killer lives — so context sheets must reach the
// specialist, distinguishably tagged, rather than landing in unclassified where nobody reads
// them. At 1-3 units per job and a triaged sheet subset, full-set-per-specialist token cost is
// trivial; do not optimize it away.
//
// sheets: [{ sheetNumber, revision, text, pageBytes? }]
// triageCandidates: { [brandName]: string[] } — per-brand candidate sheet numbers from triage
// (optional; keyword detection alone still routes when absent, e.g. hand-typed test input).
export function routeSheets(sheets, { triageCandidates = {} } = {}) {
  // Two distinct sheets sharing a sheetNumber is a real, seen-in-production extraction defect
  // (this project has a confirmed case: two different physical pages both extracted as "A-102").
  // Primary/context roles are keyed by sheetNumber, so a duplicate number conflates two physical
  // pages' roles; detect duplicates explicitly and surface them rather than silently merge.
  const sheetNumberCounts = new Map();
  for (const sheet of sheets) {
    sheetNumberCounts.set(sheet.sheetNumber, (sheetNumberCounts.get(sheet.sheetNumber) || 0) + 1);
  }
  const duplicateSheetNumbers = [...sheetNumberCounts.entries()].filter(([, count]) => count > 1).map(([num]) => num);

  // Signal (a): per-brand keyword/model detection against each sheet's own text.
  const primaryByBrand = new Map(BRANDS.map((b) => [b.name, new Set()]));
  for (const sheet of sheets) {
    for (const brand of BRANDS) {
      if (brand.detect(sheet.text).length > 0) primaryByBrand.get(brand.name).add(sheet.sheetNumber);
    }
  }

  // Signal (b): triage's per-brand candidate sheets. Matched on normalized sheet numbers since
  // triage transcribes numbers from an index listing and extraction reads them from title blocks
  // — same sheet, potentially different spacing/hyphenation.
  for (const brand of BRANDS) {
    const candidates = new Set((triageCandidates[brand.name] || []).map(normalizeSheetNumber));
    if (!candidates.size) continue;
    for (const sheet of sheets) {
      if (candidates.has(normalizeSheetNumber(sheet.sheetNumber))) {
        primaryByBrand.get(brand.name).add(sheet.sheetNumber);
      }
    }
  }

  // A firing brand gets every sheet, role-tagged for that brand. Roles differ per brand, so each
  // brand gets its own shallow-copied sheet objects rather than sharing mutated ones.
  const brandSheets = new Map(
    BRANDS.map((b) => {
      const primaries = primaryByBrand.get(b.name);
      if (!primaries.size) return [b.name, []];
      return [
        b.name,
        sheets.map((s) => ({ ...s, role: primaries.has(s.sheetNumber) ? 'primary' : 'context' })),
      ];
    })
  );

  // "Unclassified" now means: primary for no brand. Such sheets still reach every firing
  // specialist as context — they are reported, not dropped.
  const unclassified = [...new Set(
    sheets
      .filter((s) => !BRANDS.some((b) => primaryByBrand.get(b.name).has(s.sheetNumber)))
      .map((s) => s.sheetNumber)
  )];

  const multiProductSheets = [...new Set(sheets.map((s) => s.sheetNumber))]
    .map((sheetNumber) => ({
      sheetNumber,
      brands: BRANDS.filter((b) => primaryByBrand.get(b.name).has(sheetNumber)).map((b) => b.name),
    }))
    .filter((s) => s.brands.length > 1);

  return { brandSheets, unclassified, multiProductSheets, duplicateSheetNumbers };
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.brand}|${f.sheet_reference}|${f.description}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// projectSheets: [{ sheetNumber, revision, text, pageBytes? }]
// opts.triageCandidates: { [brandName]: string[] } — see routeSheets.
// opts.sheetInventory: [{ sheetNumber, title, discipline }] — the full extracted set with the
//   titles/disciplines the PDF pipeline read; when absent (hand-typed test sets calling this
//   directly), a numbers-only inventory is derived from projectSheets.
// opts.gapCheck: { gaps } from findMissingCrossReferences, or null when the caller has none.
// opts.unresolvedCandidates: sheet numbers triage named but couldn't map to a page (Phase 4:
//   surfaced in Unresolved Items, not only in pipeline diagnostics).
// opts.orderingMismatches: [{ pageIndex, expected, actual }] index-order mismatches that
//   survived extraction (Phase 4: same promotion).
export async function runProjectSynthesis(projectSheets, { triageCandidates = {}, sheetInventory = null, gapCheck = null, unresolvedCandidates = [], orderingMismatches = [] } = {}) {
  const { brandSheets, unclassified, multiProductSheets, duplicateSheetNumbers } = routeSheets(projectSheets, {
    triageCandidates,
  });

  const relevantBrands = BRANDS.filter((b) => brandSheets.get(b.name).length > 0);
  const specialistResults = await Promise.all(
    relevantBrands.map(async (b) => {
      const brandInput = brandSheets.get(b.name);
      return {
        brand: b.name,
        primarySheets: brandInput.filter((s) => s.role === 'primary').map((s) => s.sheetNumber),
        contextSheets: brandInput.filter((s) => s.role === 'context').map((s) => s.sheetNumber),
        result: await b.run(brandInput),
      };
    })
  );

  const allFindings = specialistResults.flatMap(({ brand, result }) =>
    (result.findings || []).map((f) => ({ ...f, brand }))
  );
  const deduped = dedupeFindings(allFindings);

  // Phase 3: one reconciliation pass between the specialists and sectioning. Exact-string dedupe
  // above catches identical text; the reconciler catches the same condition phrased two ways,
  // plus contradictions, absence escalations, and the generic-filler cull — all recorded on
  // report.reconciliation, nothing silently deleted. If the call fails, the report still ships
  // with the un-reconciled findings and the error surfaced, rather than throwing away five
  // specialists' worth of completed (paid) work.
  let reconciled = deduped;
  let reconciliation = null;
  if (deduped.length) {
    const requiredConditions = specialistResults.flatMap(({ brand, result }) =>
      (result.requiredConditionsUsed || []).map((rc) => ({ brand, ...rc }))
    );
    try {
      const rec = await reconcileFindings({
        findings: deduped,
        sheetInventory:
          sheetInventory || projectSheets.map((s) => ({ sheetNumber: s.sheetNumber, title: null, discipline: null })),
        gapCheck,
        multiProductSheets,
        requiredConditions,
      });
      reconciled = rec.findings;
      reconciliation = { ...rec.reconciliation, usage: rec.usage };
    } catch (err) {
      console.error(`Reconciliation failed — report ships un-reconciled: ${err.message}`);
      reconciliation = { error: err.message };
    }
  }

  const crossBrandWatch = multiProductSheets.map(({ sheetNumber, brands }) => ({
    sheetNumber,
    brands,
    findings: reconciled.filter((f) => f.sheet_reference === sheetNumber),
  }));

  // Section 1 owns every ABSENCE finding (plus reconciler escalations, which are ABSENCE findings
  // annotated escalated: true). The finding_type-keyed sections below exclude ABSENCE findings so
  // one absence doesn't render three times; the RFI List and Proposal Qualifications sections are
  // deliverables that must be complete as-is, so they take their finding types regardless of
  // evidence type.
  const isAbsence = (f) => f.evidence_type === 'ABSENCE';

  // RFI List: specialist-drafted "rfi" findings plus the reconciler's generated drafts, one flat
  // list ordered bid-gating first (stable within each group). Numbering (RFI-01...) happens in
  // the renderer.
  const specialistRfis = reconciled
    .filter((f) => f.finding_type === 'rfi')
    .map((f) => ({
      source: 'specialist',
      source_finding_id: f.id ?? null,
      brand: f.brand,
      rfi_subject: f.rfi_subject || '',
      references: Array.isArray(f.references) ? f.references.map(String) : f.references ? [String(f.references)] : [],
      question: f.question || '',
      bid_impact: f.bid_impact || '',
      bid_gating: f.bid_gating === true,
      evidence_type: f.evidence_type,
      source_citation: f.citation,
    }));
  const reconcilerRfis = (reconciliation?.rfis || []).map((r) => ({ source: 'reconciler', ...r }));
  const allRfis = [...specialistRfis, ...reconcilerRfis];
  const rfis = [...allRfis.filter((r) => r.bid_gating), ...allRfis.filter((r) => !r.bid_gating)];

  // Unresolved Items (required section, even when empty): gap-check's referenced-but-missing
  // sheets promoted out of the diagnostics appendix, unresolved triage candidates, surviving
  // ordering mismatches, and reconciler escalations.
  const unresolved = {
    gapCheckGaps: gapCheck?.gaps || [],
    unresolvedTriageCandidates: unresolvedCandidates,
    orderingMismatches,
    escalations: reconciliation?.escalations || [],
  };

  const sections = REPORT_SECTIONS.map(({ key, title }) => {
    switch (key) {
      case 'whats_not_shown':
        return { key, title, findings: reconciled.filter(isAbsence) };
      case 'rfi_list':
        return { key, title, rfis };
      case 'qualification':
        return { key, title, findings: reconciled.filter((f) => f.finding_type === 'qualification') };
      case 'field_verification':
        // The measure-day checklist bucket — findingsGuard already demotes GEOMETRY_INFERRED
        // findings into it, so no extra plumbing here.
        return { key, title, findings: reconciled.filter((f) => f.finding_type === 'measure_day_checklist' && !isAbsence(f)) };
      case 'risk_register':
        // Risk findings plus the reconciler's contradictions; Cross-Brand Watch folds in here
        // (work order Phase 4) instead of rendering as its own section.
        return {
          key,
          title,
          findings: reconciled.filter((f) => f.finding_type === 'risk' && !isAbsence(f)),
          contradictions: reconciliation?.contradictions || [],
          crossBrandWatch,
        };
      case 'unresolved':
        return { key, title, unresolved };
      default:
        return { key, title, findings: reconciled.filter((f) => f.finding_type === key && !isAbsence(f)) };
    }
  });

  const appendixSections = APPENDIX_SECTIONS.map(({ key, title }) => ({
    key,
    title,
    findings: reconciled.filter((f) => f.finding_type === key && !isAbsence(f)),
  }));

  const brandAppendix = specialistResults.map(({ brand, primarySheets, contextSheets, result }) => ({
    brand,
    // Kept for renderer/back-compat: every sheet the specialist received, primary + context.
    sheetsUsed: [...primarySheets, ...contextSheets],
    primarySheets,
    contextSheets,
    modelIdsDetected: result.modelIdsDetected,
    // Which sheets' original PDF pages the specialist actually saw (vs. extracted text only) —
    // recorded so a report reader can tell whether graphical review happened for a given sheet.
    pdfPagesAttached: result.pdfPagesAttached || [],
    findings: result.findings,
  }));

  return {
    sections,
    // Install-phase sections (preconstruction checklist, installation briefing) — rendered after
    // the Brand Appendix so they don't crowd the bid qualification package.
    appendixSections,
    crossBrandWatch,
    brandAppendix,
    // Phase 3 reconciliation output: contradictions, corroborations (merged findings recorded on
    // the kept finding's corroborated_by), escalations, the generic-filler cull (culled findings
    // recorded in full), and derived-value flags. null when no findings were produced;
    // { error } when the reconciler call itself failed and findings shipped un-reconciled.
    reconciliation,
    // Sheets that were primary for no brand. They still went to every firing specialist as
    // context — listed here so a reader knows no brand claimed them, not that they were dropped.
    unclassifiedSheets: unclassified,
    // Sheet numbers that appeared on 2+ distinct input sheets — a real extraction defect, not
    // routing noise. Findings/Cross-Brand Watch entries under these sheet numbers may conflate
    // two unrelated physical pages; surfaced explicitly rather than silently merged.
    duplicateSheetNumbers,
  };
}
