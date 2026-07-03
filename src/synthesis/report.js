import { detectModelIds as detectModernfold, runModernfoldSpecialist } from '../specialists/modernfold.js';
import { detectModelIds as detectSkyfold, runSkyfoldSpecialist } from '../specialists/skyfold.js';
import { detectModelIds as detectEuroWall, runEuroWallSpecialist } from '../specialists/euro-wall.js';
import { detectModelIds as detectAirolite, runAiroliteSpecialist } from '../specialists/airolite.js';
import { detectModelIds as detectSmokeGuard, runSmokeGuardSpecialist } from '../specialists/smoke-guard.js';

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

// sheets: [{ sheetNumber, revision, text }]
export function routeSheets(sheets) {
  const brandSheets = new Map(BRANDS.map((b) => [b.name, []]));
  const unclassified = [];

  // Two distinct sheets sharing a sheetNumber is a real, seen-in-production extraction defect
  // (this project has a confirmed case: two different physical pages both extracted as "A-102").
  // Building sheetBrands from `new Map(sheets.map(...))` silently collapses duplicate keys to one
  // shared array — both sheets' matched brands end up pushed into the same array, producing a
  // false Cross-Brand Watch entry that implies two products interact on one sheet, when they're
  // actually on two unrelated physical pages. Detect duplicates explicitly and surface them
  // rather than let the bookkeeping silently conflate two different sheets' findings.
  const sheetNumberCounts = new Map();
  for (const sheet of sheets) {
    sheetNumberCounts.set(sheet.sheetNumber, (sheetNumberCounts.get(sheet.sheetNumber) || 0) + 1);
  }
  const duplicateSheetNumbers = [...sheetNumberCounts.entries()].filter(([, count]) => count > 1).map(([num]) => num);

  const sheetBrands = new Map();
  for (const sheet of sheets) {
    if (!sheetBrands.has(sheet.sheetNumber)) sheetBrands.set(sheet.sheetNumber, []);
  }

  for (const sheet of sheets) {
    const matchedBrands = BRANDS.filter((b) => b.detect(sheet.text).length > 0);
    if (!matchedBrands.length) {
      unclassified.push(sheet.sheetNumber);
      continue;
    }
    for (const brand of matchedBrands) {
      brandSheets.get(brand.name).push(sheet);
      sheetBrands.get(sheet.sheetNumber).push(brand.name);
    }
  }

  const multiProductSheets = [...new Set(sheets.map((s) => s.sheetNumber))]
    .map((sheetNumber) => ({ sheetNumber, brands: [...new Set(sheetBrands.get(sheetNumber))] }))
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

// projectSheets: [{ sheetNumber, revision, text }]
export async function runProjectSynthesis(projectSheets) {
  const { brandSheets, unclassified, multiProductSheets, duplicateSheetNumbers } = routeSheets(projectSheets);

  const relevantBrands = BRANDS.filter((b) => brandSheets.get(b.name).length > 0);
  const specialistResults = await Promise.all(
    relevantBrands.map(async (b) => ({
      brand: b.name,
      sheetsUsed: brandSheets.get(b.name).map((s) => s.sheetNumber),
      result: await b.run(brandSheets.get(b.name)),
    }))
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

  const brandAppendix = specialistResults.map(({ brand, sheetsUsed, result }) => ({
    brand,
    sheetsUsed,
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
    unclassifiedSheets: unclassified,
    // Sheet numbers that appeared on 2+ distinct input sheets — a real extraction defect, not
    // routing noise. Findings/Cross-Brand Watch entries under these sheet numbers may conflate
    // two unrelated physical pages; surfaced explicitly rather than silently merged.
    duplicateSheetNumbers,
  };
}
