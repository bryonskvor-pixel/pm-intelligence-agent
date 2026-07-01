import { runSmokeGuardSpecialist } from './smoke-guard.js';

const SAMPLE_DRAWING_TEXT = `
Sheet A-501, Rev 1. Atrium opening protective, Level 1 to Level 2, gridline F-3.
Smoke Guard Model M2100, opening 14'-0" wide x 10'-0" tall.
Electrical drawing E-301 shows a 120V circuit routed to the controller location but does not reference the fire alarm contractor's shop drawings for the auxiliary contact connection.
AHJ has verbally indicated they want a faster egress-clear timing than manufacturer standard, but this has not yet been confirmed in writing or included in the equipment order.
Separately, elevator lobby smoke curtain Model M200 is specified with "battery backup required per owner" on the same sheet's equipment schedule.
`;

async function main() {
  const result = await runSmokeGuardSpecialist(SAMPLE_DRAWING_TEXT);
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
