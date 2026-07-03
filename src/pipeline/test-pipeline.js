import fs from 'fs';
import path from 'path';
import { runPipelineFromPdf } from './runFromPdf.js';
import { renderReportMarkdown } from '../render/renderMarkdown.js';
import { sumUsageStages, estimateCostUSD } from '../lib/extraction.js';

const PDF_PATH = process.argv[2];
if (!PDF_PATH) {
  console.error('Usage: node src/pipeline/test-pipeline.js <path-to-pdf>');
  process.exit(1);
}

async function main() {
  const bytes = fs.readFileSync(PDF_PATH);
  console.log(`Loaded ${PDF_PATH} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)\n`);

  const result = await runPipelineFromPdf(bytes);

  console.log('--- TRIAGE ---');
  for (const brand of ['Modernfold', 'Skyfold', 'Euro-Wall', 'Airolite', 'Smoke Guard']) {
    const data = result.triage.perBrand[brand] || {};
    console.log(`${brand}: ${(data.candidateSheetNumbers || []).length} candidates — ${(data.candidateSheetNumbers || []).join(', ')}`);
  }
  if (result.triage.unresolvedCandidates.length) {
    console.log('Unresolved candidate sheet numbers (not found in index order list):', result.triage.unresolvedCandidates);
  }

  console.log(`\n--- PAGES ACTUALLY EXTRACTED: ${result.pagesExtracted.length} ---`);
  console.log(result.pagesExtracted.join(', '));

  console.log(`\n--- ORDERING HEURISTIC CHECK: ${result.orderingMismatches.length} mismatch(es) ---`);
  for (const m of result.orderingMismatches) {
    console.log(`  page ${m.pageIndex}: expected "${m.expected}", got "${m.actual}"`);
  }

  console.log(`\n--- GAP CHECK: ${result.gapCheck.gaps.length} real gap(s) (${result.gapCheck.excludedNonSheetReferences} non-sheet refs excluded) ---`);
  for (const gap of result.gapCheck.gaps) {
    console.log(`  ${gap.targetSheet} referenced by ${gap.referencedBy.map((r) => r.fromSheet).join(', ')}`);
  }

  console.log(`\n--- EXTRACTION WARNINGS: ${result.extractionWarnings.length} ---`);
  for (const w of result.extractionWarnings) {
    console.log(`  [${w.sheetNumber || `page ${w.pageIndex}`}] ${w.type}: ${w.detail}`);
  }

  console.log('\n--- SIX-SECTION REPORT ---');
  for (const section of result.report.sections) {
    console.log(`${section.title}: ${section.findings.length} finding(s)`);
  }
  console.log('Cross-brand watch:', result.report.crossBrandWatch.length, 'sheet(s)');
  console.log('Brand appendix:', result.report.brandAppendix.map((b) => b.brand).join(', ') || '(none — no brand matched any extracted sheet)');
  console.log('Unclassified sheets:', result.report.unclassifiedSheets.length);
  if (result.report.duplicateSheetNumbers?.length) {
    console.log('DUPLICATE SHEET NUMBERS (extraction defect, not routing noise):', result.report.duplicateSheetNumbers.join(', '));
  }

  const totals = sumUsageStages(result.usage);
  const usageTotals = { ...totals, estimatedCostUSD: estimateCostUSD(totals) };
  console.log(`\n--- TOTAL USAGE (${totals.callCount} API calls across index+triage+extraction) ---`);
  console.log(`Input tokens: ${totals.inputTokens.toLocaleString()}, Output tokens: ${totals.outputTokens.toLocaleString()}`);
  console.log(`Cache write: ${totals.cacheCreationInputTokens.toLocaleString()}, Cache read: ${totals.cacheReadInputTokens.toLocaleString()}`);
  console.log(`Estimated cost: $${usageTotals.estimatedCostUSD.toFixed(3)} (rough, verify current pricing) for ${result.pagesExtracted.length} extracted pages`);

  const md = renderReportMarkdown(result.report, {
    projectName: path.basename(PDF_PATH, path.extname(PDF_PATH)),
    generatedAt: new Date().toDateString(),
    diagnostics: {
      pagesExtracted: result.pagesExtracted,
      triage: result.triage,
      orderingMismatches: result.orderingMismatches,
      gapCheck: result.gapCheck,
      extractionWarnings: result.extractionWarnings,
      usageTotals,
    },
  });
  fs.writeFileSync('pipeline_report.md', md);
  console.log('\nReport written to pipeline_report.md');
}

main().catch((err) => {
  console.error('Pipeline test failed:', err);
  process.exit(1);
});
