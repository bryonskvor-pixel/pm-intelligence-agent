// Phase 2 acceptance: at least one seeded required-condition absence is caught when its sheet is
// withheld from the input. Live test (one Skyfold specialist call, ~cents).
//
// The sheet set deliberately names a Skyfold product but withholds everything the seeded
// required conditions demand: no structural sheet (support steel / deflection criteria), no
// electrical sheet (3-phase circuit), no RCP (plenum no-fly zone). A correct Track 2
// implementation must flag these as ABSENCE findings citing the required_conditions rows.
import { runSkyfoldSpecialist } from './skyfold.js';
import { EVIDENCE_TYPES } from '../lib/findingsGuard.js';

const SHEETS = [
  {
    sheetNumber: 'A-405',
    revision: '1',
    role: 'primary',
    text: `Level 2 ballroom divider wall, gridline D-4 to D-9.
Operable wall: Skyfold Classic 60, 24'-0" long x 14'-1" high, standard drive system.
Finish: fabric-wrapped acoustic face, color per finish schedule.`,
  },
  {
    sheetNumber: 'A-701',
    revision: '0',
    role: 'context',
    text: `Interior finish schedule. Ballroom divider: fabric finish F-3. No structural, electrical, or ceiling information on this sheet.`,
  },
];

async function main() {
  console.log('Running Skyfold specialist with structural/electrical/RCP sheets withheld...\n');
  const result = await runSkyfoldSpecialist(SHEETS);

  console.log(`Required conditions loaded from D1: ${result.requiredConditionsUsed.length}`);
  console.log(`Findings: ${result.findings.length}\n`);

  let invalidEvidence = 0;
  for (const f of result.findings) {
    if (!EVIDENCE_TYPES.includes(f.evidence_type)) invalidEvidence += 1;
    console.log(`- [${f.finding_type} / ${f.evidence_type} / ${f.sheet_reference}] ${f.description}`);
    console.log(`  citation: ${f.citation}\n`);
  }

  const absenceFindings = result.findings.filter((f) => f.evidence_type === 'ABSENCE');
  console.log(`\nABSENCE findings: ${absenceFindings.length}`);
  console.log(`Invalid evidence_type values: ${invalidEvidence}`);
  if (result.guardWarnings.length) {
    console.log(`Guard warnings: ${JSON.stringify(result.guardWarnings, null, 2)}`);
  }

  const failures = [];
  if (!result.requiredConditionsUsed.length) failures.push('no required_conditions rows loaded from D1');
  if (!absenceFindings.length) failures.push('no ABSENCE finding produced despite withheld structural/electrical/RCP sheets');
  if (invalidEvidence) failures.push(`${invalidEvidence} finding(s) with invalid evidence_type`);

  if (failures.length) {
    console.error(`\nACCEPTANCE FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('\nACCEPTANCE PASSED: required-condition absence caught with the sheet withheld; all evidence types valid.');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
