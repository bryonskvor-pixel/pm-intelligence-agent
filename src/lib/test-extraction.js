import fs from 'fs';
import { extractSheetsFromPdf } from './extraction.js';
import { buildTagIndex, correlateOneHop } from './tagIndex.js';

const PDF_PATH = process.argv[2];
if (!PDF_PATH) {
  console.error('Usage: node src/lib/test-extraction.js <path-to-pdf> [maxPages]');
  process.exit(1);
}
const MAX_PAGES = process.argv[3] ? parseInt(process.argv[3], 10) : null;

// Rough estimate only, at Claude Sonnet's published per-MTok rates as of this writing
// ($3 input / $15 output / $3.75 cache write / $0.30 cache read) — verify current pricing
// before treating this as a real budget number; the token counts above it are exact, this isn't.
function estimateCostUSD(usage) {
  return (
    (usage.inputTokens / 1e6) * 3 +
    (usage.outputTokens / 1e6) * 15 +
    (usage.cacheCreationInputTokens / 1e6) * 3.75 +
    (usage.cacheReadInputTokens / 1e6) * 0.3
  );
}

async function main() {
  const bytes = fs.readFileSync(PDF_PATH);
  console.log(`Loaded ${PDF_PATH} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);

  const opts = {};
  if (MAX_PAGES) {
    opts.pageIndices = Array.from({ length: MAX_PAGES }, (_, i) => i);
    console.log(`Limiting to first ${MAX_PAGES} pages for this test run.`);
  }
  const { sheets, usage } = await extractSheetsFromPdf(bytes, opts);

  console.log(`\nExtracted ${sheets.length} pages.\n`);
  console.log('--- SHEET SUMMARY ---');
  for (const s of sheets) {
    console.log(
      `[${s.pageIndex}] ${s.sheetNumber ?? '(no sheet number)'} rev ${s.revision ?? '?'} — ${s.discipline ?? '?'} — "${s.title ?? ''}" — ${
        (s.schedules || []).length
      } schedules, ${(s.tags || []).length} tags, ${(s.gridlines || []).length} gridlines, ${(s.crossReferences || []).length} cross-refs`
    );
    if (s.notes) console.log(`    notes: ${s.notes}`);
    for (const w of s.extractionWarnings || []) console.log(`    [WARNING] ${w.type}: ${w.detail}`);
  }

  const totalWarnings = sheets.reduce((sum, s) => sum + (s.extractionWarnings || []).length, 0);
  console.log(`\n${totalWarnings} extraction warning(s) across ${sheets.length} sheets.`);

  const withNumbers = sheets.filter((s) => s.sheetNumber);
  const byNumber = new Map(withNumbers.map((s) => [s.sheetNumber, s]));
  const tagIndex = buildTagIndex(withNumbers);

  console.log(`\n--- TAG INDEX (${tagIndex.size} unique keys) ---`);
  const sharedKeys = [...tagIndex.entries()].filter(([, sheetSet]) => sheetSet.size > 1);
  console.log(`${sharedKeys.length} keys are shared across 2+ sheets (these are what drive correlation):`);
  for (const [key, sheetSet] of sharedKeys.slice(0, 40)) {
    console.log(`  ${key} -> ${[...sheetSet].join(', ')}`);
  }
  if (sharedKeys.length > 40) console.log(`  ... and ${sharedKeys.length - 40} more`);

  if (withNumbers.length) {
    const sample = withNumbers[0].sheetNumber;
    const { direct, inferred, inferredVia } = correlateOneHop([sample], tagIndex, byNumber);
    console.log(`\n--- SAMPLE CORRELATION: one-hop from ${sample} ---`);
    console.log('Direct:', direct);
    console.log('Inferred:', inferred);
    for (const [sheetNumber, via] of inferredVia) {
      console.log(`  ${sheetNumber} inferred via:`, via);
    }
  }

  console.log(`\n--- USAGE (${usage.callCount} API calls) ---`);
  console.log(`Input tokens:              ${usage.inputTokens.toLocaleString()}`);
  console.log(`Output tokens:             ${usage.outputTokens.toLocaleString()}`);
  console.log(`Cache write tokens:        ${usage.cacheCreationInputTokens.toLocaleString()}`);
  console.log(`Cache read tokens:         ${usage.cacheReadInputTokens.toLocaleString()}`);
  console.log(`Estimated cost:            $${estimateCostUSD(usage).toFixed(3)} (rough, verify current pricing)`);

  fs.writeFileSync('extraction_output.json', JSON.stringify({ sheets, usage }, null, 2));
  console.log('\nFull extraction output written to extraction_output.json');
}

main().catch((err) => {
  console.error('Extraction test failed:', err);
  process.exit(1);
});
