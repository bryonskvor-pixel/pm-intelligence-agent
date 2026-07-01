import { runSkyfoldSpecialist } from './skyfold.js';

const SAMPLE_DRAWING_TEXT = `
Sheet A-405, Rev 1. Level 2 ballroom divider wall, gridline D-4 to D-9.
Operable wall: Skyfold Classic 60, 24'-0" long x 14'-1" high, standard drive system.
Support steel shown as W8x10 continuous beam spanning the full 24'-0", by structural engineer of record.
RCP shows a 16" round HVAC duct crossing the ceiling pocket zone at gridline D-6, routed perpendicular to the wall's travel path.
Electrical drawing E-104 shows panel EP-4 feeding this area at 480V, 3-phase.
No access panel shown in the acoustic ceiling near the motor location.
`;

async function main() {
  console.log('Running Skyfold specialist on sample drawing text...\n');
  const result = await runSkyfoldSpecialist(SAMPLE_DRAWING_TEXT);

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
