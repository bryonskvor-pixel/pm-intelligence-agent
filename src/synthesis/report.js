import { detectModelIds as detectModernfold, runModernfoldSpecialist } from '../specialists/modernfold.js';
import { detectModelIds as detectSkyfold, runSkyfoldSpecialist } from '../specialists/skyfold.js';
import { detectModelIds as detectEuroWall, runEuroWallSpecialist } from '../specialists/euro-wall.js';
import { detectModelIds as detectAirolite, runAiroliteSpecialist } from '../specialists/airolite.js';
import { detectModelIds as detectSmokeGuard, runSmokeGuardSpecialist } from '../specialists/smoke-guard.js';
import { normalizeSheetNumber } from '../lib/sheetNumber.js';

const BRANDS = [
  { name: 'Modernfold', detect: detectModernfold, run: runModernfoldSpecialist },
  { name: 'Skyfold', detect: detectSkyfold, run: runSkyfoldSpecialist },
  { name: 'Euro-Wall', detect: detectEuroWall, run: runEuroWallSpecialist },
  { name: 'Airolite', detect: detectAirolite, run: runAiroliteSpecialist },
  { name: 'Smoke Guard', detect: detectSmokeGuard, run: runSmokeGuardSpecialist },
];

const REPORT_SECTIONS = [
  { key: 'estimating_flag', title: 'Estimating Flags' },
  { key: 'critical_path', title: 'Critical Path / Lag' },
  { key: 'risk', title: 'Risk Register' },
  { key: 'preconstruction_checklist', title: 'Preconstruction Checklist' },
  { key: 'measure_day_checklist', title: 'Measure Day Checklist' },
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
export async function runProjectSynthesis(projectSheets, { triageCandidates = {} } = {}) {
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

  const sections = REPORT_SECTIONS.map(({ key, title }) => ({
    key,
    title,
    findings: deduped.filter((f) => f.finding_type === key),
  }));

  const crossBrandWatch = multiProductSheets.map(({ sheetNumber, brands }) => ({
    sheetNumber,
    brands,
    findings: deduped.filter((f) => f.sheet_reference === sheetNumber),
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
    crossBrandWatch,
    brandAppendix,
    // Sheets that were primary for no brand. They still went to every firing specialist as
    // context — listed here so a reader knows no brand claimed them, not that they were dropped.
    unclassifiedSheets: unclassified,
    // Sheet numbers that appeared on 2+ distinct input sheets — a real extraction defect, not
    // routing noise. Findings/Cross-Brand Watch entries under these sheet numbers may conflate
    // two unrelated physical pages; surfaced explicitly rather than silently merged.
    duplicateSheetNumbers,
  };
}
