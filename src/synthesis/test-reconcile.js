// Phase 3 acceptance test (work order): a test set engineered with
//   (a) one deliberate cross-sheet contradiction -> contradiction entry citing both sheets,
//   (b) one condition phrased two ways by two specialists -> merged into one finding,
//   (c) one "coordinate with GC" filler finding -> culled.
// Plus the reconciler's job 3, exercised the same way:
//   (d) an ABSENCE finding whose where_expected sheet type (electrical) has no sheet in the
//       inventory at all -> escalated.
// And the documented Phase 2 residual, policed at this chokepoint:
//   (e) a finding containing a model-computed percentage delta -> derived-value flag (annotation
//       only; the finding must survive).
//
// Calls reconcileFindings directly with hand-crafted specialist-shaped findings — one live
// Sonnet call, no specialist calls — so each acceptance behavior is exercised against a known
// input instead of whatever five live specialists happen to phrase that day.
// Run: npm run test:reconcile   (needs .env.local for ANTHROPIC_API_KEY)

import { reconcileFindings } from './reconcile.js';

const SHEET_INVENTORY = [
  { sheetNumber: 'A-405', title: 'LEVEL 2 BALLROOM PLAN', discipline: 'architectural' },
  { sheetNumber: 'A-406', title: 'LEVEL 2 BALLROOM RCP', discipline: 'architectural' },
  { sheetNumber: 'A-601', title: 'LOUVER SCHEDULE', discipline: 'architectural' },
  { sheetNumber: 'S-201', title: 'LEVEL 2 STRUCTURAL FRAMING PLAN', discipline: 'structural' },
  { sheetNumber: 'G-001', title: 'GENERAL NOTES AND SHEET INDEX', discipline: 'cover' },
  // Deliberately NO electrical (E) sheet — the ABSENCE finding below expects its condition on E
  // sheets, so the reconciler should escalate it (the sheet type itself is missing from the set).
];

const FINDINGS = [
  // (a) Deliberate cross-sheet contradiction: A-405 states L/360, S-201 states L/240 for the
  // same ballroom divider header. Two findings, same brand, different sheets.
  {
    brand: 'Skyfold',
    finding_type: 'estimating_flag',
    description: 'Sheet A-405 general notes state deflection criteria of L/360 for the ballroom divider support header at gridline D-4 to D-9.',
    citation: 'Sheet A-405 general notes; Skyfold Standard Deflection Criteria (D1: SKYFOLD-GENERAL)',
    sheet_reference: 'A-405',
    evidence_type: 'TEXT_READ',
    consequence: 'Deflection criteria stricter than assumed changes the structural coordination scope.',
  },
  {
    brand: 'Skyfold',
    finding_type: 'risk',
    description: 'Sheet S-201 states deflection criteria of L/240 for the W8x10 continuous beam at the operable wall location, gridline D-4 to D-9.',
    citation: 'Sheet S-201 framing plan notes; Skyfold Standard Deflection Criteria (D1: SKYFOLD-GENERAL)',
    sheet_reference: 'S-201',
    evidence_type: 'TEXT_READ',
    consequence: 'If the structure is designed to a looser deflection limit than the architectural sheets require, the Skyfold unit may bind.',
  },
  // (b) Same underlying condition phrased two ways by two specialists: the Airolite louver drawn
  // in the Skyfold panel travel path on A-406.
  {
    brand: 'Skyfold',
    finding_type: 'risk',
    description: 'The RCP on A-406 shows Airolite relief louver L-12 positioned directly within the vertical travel path of the Skyfold panel stack along the pocket wall upper zone — an obstruction in the panel travel path.',
    citation: 'Sheet A-406 RCP; Skyfold plenum clearance requirements (D1: SKYFOLD-GENERAL)',
    sheet_reference: 'A-406',
    evidence_type: 'TEXT_READ',
    consequence: 'The wall cannot deploy past an obstruction; requires relocation of the louver or the pocket before installation.',
  },
  {
    brand: 'Airolite',
    finding_type: 'risk',
    description: 'Relief louver L-12 on sheet A-406 is located in the same plenum zone that the operable wall system occupies when retracted; the louver placement conflicts with the moving wall equipment shown on the same sheet.',
    citation: 'Sheet A-406 RCP; Airolite installation clearance guidance (Vectorize: airolite-install-03)',
    sheet_reference: 'A-406',
    evidence_type: 'TEXT_READ',
    consequence: 'Louver airflow performance and access for service are compromised if the wall stack occupies the same zone.',
  },
  // (c) Generic filler with no product-specific trigger — must be culled.
  {
    brand: 'Modernfold',
    finding_type: 'preconstruction_checklist',
    description: 'Coordinate with GC prior to installation.',
    citation: 'General coordination practice',
    sheet_reference: 'A-405',
    evidence_type: 'TEXT_READ',
  },
  // (d) ABSENCE finding whose where_expected sheet type (electrical) has no sheet in the
  // inventory — should escalate.
  {
    brand: 'Skyfold',
    finding_type: 'estimating_flag',
    description: 'Required condition not found on any provided sheet: a dedicated 3-phase power circuit for the Skyfold drive motor shown on the electrical sheets. Absence consequence: unit cannot be commissioned; electrical scope gap discovered at install.',
    citation: 'required_conditions: SKYFOLD-GENERAL — "3-phase power circuit shown on E sheets" (source: Skyfold Zenith Premium GC/electrical notes)',
    sheet_reference: 'ABSENT',
    evidence_type: 'ABSENCE',
    consequence: 'Unpriced electrical scope; commissioning delay.',
  },
  // (e) Documented Phase 2 residual: a computed percentage delta beside verbatim source values.
  {
    brand: 'Airolite',
    finding_type: 'estimating_flag',
    description: 'The scheduled louver free-area velocity drops by 42% — from 1069 fpm to 618 fpm — when the intake screen option is added per the schedule note on A-601.',
    citation: 'Sheet A-601 louver schedule; Airolite performance data (D1: AIROLITE-GENERAL)',
    sheet_reference: 'A-601',
    evidence_type: 'SCHEDULE_EXTRACTED',
    consequence: 'Mechanical engineer may reject the substitution if velocity falls below the scheduled requirement.',
  },
];

const REQUIRED_CONDITIONS = [
  {
    brand: 'Skyfold',
    model_id: 'SKYFOLD-GENERAL',
    condition: 'Dedicated 3-phase power circuit for the drive motor shown on electrical sheets',
    where_expected: 'electrical (E) sheets',
    absence_consequence: 'Unit cannot be commissioned; electrical scope gap discovered at install',
    source_doc: 'Skyfold Zenith Premium GC/electrical notes',
  },
];

function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
  return ok;
}

async function main() {
  console.log(`Reconciling ${FINDINGS.length} engineered findings (one live Sonnet call)...\n`);
  const { findings, reconciliation, usage } = await reconcileFindings({
    findings: FINDINGS,
    sheetInventory: SHEET_INVENTORY,
    gapCheck: { gaps: [] },
    multiProductSheets: [{ sheetNumber: 'A-406', brands: ['Skyfold', 'Airolite'] }],
    requiredConditions: REQUIRED_CONDITIONS,
  });

  console.log('--- RECONCILIATION OUTPUT ---');
  console.log(JSON.stringify(reconciliation, null, 2));
  console.log(`\nFindings in: ${FINDINGS.length}, out: ${findings.length}`);
  if (usage) console.log(`Usage: ${usage.inputTokens} in / ${usage.outputTokens} out\n`);

  const results = [];

  // (a) Contradiction citing both sheets.
  const contradiction = reconciliation.contradictions.find(
    (c) => c.sheets.includes('A-405') && c.sheets.includes('S-201')
  );
  results.push(check(
    'cross-sheet contradiction entry cites both A-405 and S-201',
    Boolean(contradiction),
    contradiction ? `finding_ids: ${contradiction.finding_ids.join(', ')}` : `contradictions: ${JSON.stringify(reconciliation.contradictions.map((c) => c.sheets))}`
  ));

  // (b) The two A-406 travel-path findings (F3, F4) merged into one.
  const merge = reconciliation.corroborations.find(
    (c) => [c.keep_id, ...c.merged_ids].sort().join(',') === 'F3,F4'
  );
  const survivors = findings.filter((f) => f.id === 'F3' || f.id === 'F4');
  results.push(check(
    'duplicated A-406 travel-path finding (F3/F4) merged to one surviving finding',
    Boolean(merge) && survivors.length === 1 && (survivors[0].corroborated_by || []).length === 1,
    `corroborations: ${JSON.stringify(reconciliation.corroborations.map((c) => [c.keep_id, c.merged_ids]))}, survivors: ${survivors.length}`
  ));

  // (c) The "coordinate with GC" filler (F5) culled.
  const culledIds = reconciliation.culled.map((c) => c.finding.id);
  results.push(check(
    '"Coordinate with GC" filler finding (F5) culled',
    culledIds.includes('F5') && !findings.some((f) => f.id === 'F5'),
    `culled: ${culledIds.join(', ') || 'none'}`
  ));

  // (d) The ABSENCE finding (F6) escalated — its where_expected sheet type has no sheet in the set.
  const escalation = reconciliation.escalations.find((e) => e.finding_id === 'F6');
  results.push(check(
    'ABSENCE finding (F6) escalated: electrical sheets missing from the set entirely',
    Boolean(escalation),
    escalation ? `missing: ${escalation.missing_sheet_types.join('; ')}` : 'no escalation for F6'
  ));

  // (e) Derived-value residual (F7) flagged but NOT removed. Reported, non-fatal: this is the
  // chokepoint policing extension, not a work-order acceptance criterion.
  const dvFlag = reconciliation.derivedValueFlags.find((d) => d.finding_id === 'F7');
  const f7Survived = findings.some((f) => f.id === 'F7');
  check(
    '(non-fatal) computed "drops by 42%" residual flagged as derived value, finding kept',
    Boolean(dvFlag) && f7Survived,
    `flagged: ${Boolean(dvFlag)}, survived: ${f7Survived}`
  );
  results.push(check('derived-value handling never removes the finding', f7Survived));

  // (f) Phase 4: the reconciler drafts RFIs from discrepancy/absence findings. The engineered set
  // contains one ABSENCE finding (F6) and one cross-sheet discrepancy (F1/F2), so at least one
  // complete RFI draft must come back, with its evidence_type inherited from the real finding.
  const rfis = reconciliation.rfis || [];
  const completeRfi = rfis.find((r) => r.rfi_subject && r.question && r.bid_impact && r.references.length);
  results.push(check(
    'Phase 4: at least one complete RFI drafted (subject, references, question, bid_impact)',
    Boolean(completeRfi),
    `rfis: ${rfis.length ? rfis.map((r) => `${r.source_finding_id}${r.bid_gating ? ' [gating]' : ''} "${r.rfi_subject}"`).join('; ') : 'none'}`
  ));
  const absenceRfi = rfis.find((r) => r.source_finding_id === 'F6');
  results.push(check(
    'Phase 4: the ABSENCE finding (F6) produced an RFI with inherited evidence_type ABSENCE',
    Boolean(absenceRfi) && absenceRfi.evidence_type === 'ABSENCE',
    absenceRfi ? `evidence_type: ${absenceRfi.evidence_type}` : 'no RFI for F6'
  ));

  // Reconciler must never invent: every surviving finding is one of the inputs, unchanged in text.
  const inputDescriptions = new Set(FINDINGS.map((f) => f.description));
  results.push(check(
    'no invented or rewritten findings (every surviving description matches an input verbatim)',
    findings.every((f) => inputDescriptions.has(f.description))
  ));

  const failed = results.filter((r) => !r).length;
  console.log(`\n${failed ? `${failed} acceptance check(s) FAILED` : 'All acceptance checks passed.'}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
