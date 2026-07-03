import fs from 'fs';
import { findMissingCrossReferences } from './gapCheck.js';

// Loads the already-saved full extraction and simulates a human curating a subset of pages —
// here, "just the Enlarged Plans & Elevations sheets, A-401 through A-408" — the kind of narrow
// pull someone would make if they only cared about one area of the building. Then checks whether
// that subset references anything outside itself.
const raw = JSON.parse(fs.readFileSync('extraction_output.json', 'utf-8'));
const allSheets = (raw.sheets || raw).filter((s) => s.sheetNumber);

const curatedNumbers = new Set(['A-401', 'A-402', 'A-403', 'A-404', 'A-405', 'A-406', 'A-407', 'A-408']);
const curatedSet = allSheets.filter((s) => curatedNumbers.has(s.sheetNumber));

console.log(`Curated set: ${curatedSet.map((s) => s.sheetNumber).join(', ')} (${curatedSet.length} sheets)\n`);

const { gaps, excludedNonSheetReferences } = findMissingCrossReferences(curatedSet);
console.log(`--- GAP CHECK: ${gaps.length} sheet(s) referenced but not in the curated set (${excludedNonSheetReferences} non-sheet references excluded) ---`);
for (const gap of gaps) {
  console.log(`\n${gap.targetSheet} — referenced by:`);
  for (const ref of gap.referencedBy) {
    console.log(`  from ${ref.fromSheet}: "${ref.context}"`);
  }
}

console.log('\n--- Sanity check: full 62-sheet set should have far fewer/no external gaps ---');
const fullSetResult = findMissingCrossReferences(allSheets);
console.log(`${fullSetResult.gaps.length} sheet(s) referenced but not present anywhere in the full extracted set (${fullSetResult.excludedNonSheetReferences} non-sheet references excluded).`);
for (const gap of fullSetResult.gaps) {
  console.log(`  ${gap.targetSheet} referenced by ${gap.referencedBy.map((r) => r.fromSheet).join(', ')}`);
}
