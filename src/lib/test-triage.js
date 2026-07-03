import fs from 'fs';
import { triageFromIndexText } from './triage.js';

// Reuses the already-saved extraction output's sheet-index page (page 0) — no new extraction
// cost, just one new triage call. This print doesn't actually contain any of the 5 ingested
// brands, which makes it a useful negative-case test: a good triage pass should mostly land
// everything in unclassifiedSheetNumbers rather than force false matches onto unrelated sheets.
const raw = JSON.parse(fs.readFileSync('extraction_output.json', 'utf-8'));
const sheets = raw.sheets || raw;
const indexSheet = sheets.find((s) => s.pageIndex === 0);
if (!indexSheet) {
  console.error('No page 0 (sheet index) found in extraction_output.json — run test-extraction.js first.');
  process.exit(1);
}

async function main() {
  console.log('Running triage against the real sheet index (no new extraction cost)...\n');
  const { result, usage } = await triageFromIndexText(indexSheet.rawText);

  for (const [brand, data] of Object.entries(result)) {
    if (brand === 'unclassifiedSheetNumbers' || brand === 'orderedSheetNumbers') continue;
    console.log(`${brand}: ${(data.candidateSheetNumbers || []).length} candidate sheet(s)`);
    if (data.candidateSheetNumbers?.length) console.log('  ', data.candidateSheetNumbers.join(', '));
    console.log('   reasoning:', data.reasoning);
  }
  console.log(`\nUnclassified: ${(result.unclassifiedSheetNumbers || []).length} sheet(s)`);
  console.log(`Ordered listing length: ${(result.orderedSheetNumbers || []).length} sheet(s)`);

  console.log('\n--- USAGE ---');
  console.log(`Input: ${usage.inputTokens}, Output: ${usage.outputTokens}`);
}

main().catch((err) => {
  console.error('Triage test failed:', err);
  process.exit(1);
});
