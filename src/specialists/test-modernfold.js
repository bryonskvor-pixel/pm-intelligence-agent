import { runModernfoldSpecialist } from './modernfold.js';

const SAMPLE_DRAWING_TEXT = `
Sheet A-301, Rev 2. Interior partition wall, Level 3 conference suite.
Operable partition: Modernfold Acousti-Seal 933E, electrically operated, 50 STC steel skin panels.
Stacking pocket shown at gridline C-4, dimensioned 38 inches deep x 12'-0" wide.
Electrical panel EP-2 shown mounted on the wall inside the stacking pocket footprint per E-201.
Floor finish: polished concrete, no flatness callout noted on this sheet.
Suspension: #14 system per spec.
`;

async function main() {
  console.log('Running Modernfold specialist on sample drawing text...\n');
  const result = await runModernfoldSpecialist(SAMPLE_DRAWING_TEXT);

  console.log('Model IDs detected:', result.modelIdsDetected);
  console.log(`D1 parameters retrieved: ${result.paramsUsed.length}`);
  console.log(`Vectorize matches retrieved: ${result.semanticMatches.length}`);
  console.log('\n--- FINDINGS ---');
  console.log(JSON.stringify(result.findings, null, 2));
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
