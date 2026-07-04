// Deterministic tests for the Phase 2c findings guard. No API calls, free to run.
import assert from 'node:assert/strict';
import { guardFindings, EVIDENCE_TYPES } from './findingsGuard.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('valid findings pass through untouched', () => {
  const input = [
    { finding_type: 'risk', evidence_type: 'TEXT_READ', description: 'Voltage mismatch: sheet states 480V, D1 requires 208V.' },
    { finding_type: 'estimating_flag', evidence_type: 'ABSENCE', description: 'Deflection criteria not found on any provided sheet.' },
  ];
  const { findings, warnings } = guardFindings(input);
  assert.deepEqual(findings, input);
  assert.equal(warnings.length, 0);
});

check('GEOMETRY_INFERRED demoted to measure_day_checklist with demoted_from recorded', () => {
  const { findings, warnings } = guardFindings([
    { finding_type: 'estimating_flag', evidence_type: 'GEOMETRY_INFERRED', description: 'Pocket appears too shallow for the stack based on plan scale.' },
  ]);
  assert.equal(findings[0].finding_type, 'measure_day_checklist');
  assert.equal(findings[0].demoted_from, 'estimating_flag');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].type, 'geometry_inferred_demoted');
});

check('GEOMETRY_INFERRED already a measure_day item is not re-demoted', () => {
  const { findings, warnings } = guardFindings([
    { finding_type: 'measure_day_checklist', evidence_type: 'GEOMETRY_INFERRED', description: 'Verify clearance at header in field.' },
  ]);
  assert.equal(findings[0].demoted_from, undefined);
  assert.equal(warnings.length, 0);
});

check('measurement value inside GEOMETRY_INFERRED finding is warned about, never rewritten', () => {
  const desc = 'Pocket scales to roughly 38 in. deep, which looks insufficient.';
  const { findings, warnings } = guardFindings([
    { finding_type: 'risk', evidence_type: 'GEOMETRY_INFERRED', description: desc },
  ]);
  assert.equal(findings[0].description, desc, 'description must never be paraphrased/rewritten');
  assert.ok(warnings.some((w) => w.type === 'measurement_in_geometry_inferred'));
});

check('measurement values in non-geometry findings are allowed (verbatim quotes are legal)', () => {
  const { warnings } = guardFindings([
    { finding_type: 'risk', evidence_type: 'TEXT_READ', description: 'Sheet A-210 states header clearance 6 in.; D1 states housing height 6.25 in.' },
  ]);
  assert.equal(warnings.length, 0);
});

check('missing/invalid evidence_type is warned about and left visible, not coerced', () => {
  const { findings, warnings } = guardFindings([
    { finding_type: 'risk', description: 'No evidence_type at all.' },
    { finding_type: 'risk', evidence_type: 'VIBES', description: 'Made-up type.' },
  ]);
  assert.equal(findings[0].evidence_type, undefined);
  assert.equal(findings[1].evidence_type, 'VIBES');
  assert.equal(warnings.filter((w) => w.type === 'invalid_evidence_type').length, 2);
});

check('non-array input returns empty findings with a warning instead of throwing', () => {
  const { findings, warnings } = guardFindings({ oops: true });
  assert.deepEqual(findings, []);
  assert.equal(warnings[0].type, 'not_an_array');
});

check('EVIDENCE_TYPES exports the six contract values', () => {
  assert.deepEqual(EVIDENCE_TYPES, ['TEXT_READ', 'SCHEDULE_EXTRACTED', 'SYMBOL_INTERPRETED', 'GEOMETRY_INFERRED', 'CROSS_REFERENCE', 'ABSENCE']);
});

console.log(`\n${passed} findings-guard checks passed.`);
