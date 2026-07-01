import { runAiroliteSpecialist } from './airolite.js';

const SAMPLE_DRAWING_TEXT = `
Sheet A-601, Rev 2. Mechanical louver schedule, exterior wall gridline B-7, weather-exposed intake location.
Louver L-3: Airolite AC153, opening 96 in. wide x 60 in. tall, single section shown, no mullion or reinforcing member detailed.
Louver L-5: Airolite T6636 adjustable louver serving AHU-2 intake. Commissioning agent's punch list note states blades were field-adjusted to 90 degree open position to meet the AHU's design CFM after initial testing showed insufficient airflow at the original 45 degree setting.

Sheet A-702, Rev 1. West facade sun control schedule.
Sun Control SC-1: Airolite ASC6, opening 168 in. wide x 48 in. projection, finish schedule calls out "Color Anodize - Dark Bronze" to match adjacent storefront mullions.

Sheet A-450, Rev 0. Loading dock mechanical louver schedule, exterior wall, HVAC exhaust fan EF-4 relief opening.
Louver L-9: Airolite CBG100 continue-line grille specified per architect's RFI response, opening 48 in. wide x 48 in. tall.
`;

async function main() {
  const result = await runAiroliteSpecialist(SAMPLE_DRAWING_TEXT);
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
