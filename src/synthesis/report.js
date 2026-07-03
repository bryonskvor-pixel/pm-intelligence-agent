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
  const sheetBrands = new Map(sheets.map((s) => [s.sheetNumber, []]));
  const unclassified = [];

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

  const multiProductSheets = sheets
    .map((s) => ({ sheetNumber: s.sheetNumber, brands: sheetBrands.get(s.sheetNumber) }))
    .filter((s) => s.brands.length > 1);

  return { brandSheets, unclassified, multiProductSheets };
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
  const { brandSheets, unclassified, multiProductSheets } = routeSheets(projectSheets);

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
    findings: result.findings,
  }));

  return {
    sections,
    crossBrandWatch,
    brandAppendix,
    unclassifiedSheets: unclassified,
  };
}
