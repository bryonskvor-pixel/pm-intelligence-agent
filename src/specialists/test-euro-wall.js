import { runEuroWallSpecialist } from './euro-wall.js';

const SAMPLE_DRAWING_TEXT = `
Sheet A-301, Rev 2. West lanai opening, Miami-Dade HVHZ jurisdiction, wind-borne debris region per project scope.
Opening FD-1: Euro-Wall Vista Fold C3, 4-panel impact-rated folding door, single-direction opening. Sill schedule note: "Channel Sill, per architect standard detail" — no sill part number called out separately.
Shop drawing note: sill liner to be installed immediately following frame set, prior to rough-in inspection, to protect the track during remaining trades' work.

Sheet A-305, Rev 0. Main entry, ground floor.
Opening PV-1: Euro-Wall Vista Pivot, single panel, RH Outswing. General contractor's schedule shows pivot door installation in week 3, with finished flooring (porcelain tile) scheduled for week 9. No mullion/sidelight condition on this opening.

Sheet A-410, Rev 1. South glass wall, second floor lobby, floor-to-ceiling glazing.
Opening TL-1: Euro-Wall Vista TL thin-line fixed glass wall, single unit, 150 in. wide x 132 in. tall. Spec note references brochure "up to 90 psf" wind load rating for this scope of work.
`;

async function main() {
  const result = await runEuroWallSpecialist(SAMPLE_DRAWING_TEXT);
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
