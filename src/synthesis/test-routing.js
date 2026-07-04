// Deterministic routing acceptance test for Phase 1 (Remediation Work Order, Bid Qualification
// Lens): a specialist fires on keyword match OR triage candidacy, and every firing specialist
// receives ALL sheets, role-tagged primary vs. context. Pure routing logic — no API calls, free
// to run.
import assert from 'node:assert/strict';
import { routeSheets } from './report.js';
import { detectModelIds as detectSkyfold } from '../specialists/skyfold.js';
import { detectModelIds as detectModernfold } from '../specialists/modernfold.js';

const SKYFOLD_SHEET = {
  sheetNumber: 'A-405',
  revision: '1',
  text: `Level 2 ballroom divider wall. Operable wall: Skyfold Classic 60, 24'-0" long x 14'-1" high.`,
};

// The Phase 1 acceptance case: a structural sheet with NO brand keywords anywhere on it.
const STRUCTURAL_SHEET = {
  sheetNumber: 'S-201',
  revision: '0',
  text: `Structural framing plan, Level 2. W8x10 continuous beam gridline D-4 to D-9, deflection limited to L/360. No proprietary products named on this sheet.`,
};

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

check('acceptance: Skyfold-keyword sheet + no-keyword structural sheet both reach the Skyfold specialist, structural tagged context', () => {
  const { brandSheets, unclassified } = routeSheets([SKYFOLD_SHEET, STRUCTURAL_SHEET]);
  const skyfoldInput = brandSheets.get('Skyfold');
  assert.equal(skyfoldInput.length, 2, 'Skyfold specialist must receive ALL sheets, not just its keyword matches');
  const byNumber = new Map(skyfoldInput.map((s) => [s.sheetNumber, s]));
  assert.equal(byNumber.get('A-405').role, 'primary');
  assert.equal(byNumber.get('S-201').role, 'context');
  // The structural sheet is primary for no brand — reported unclassified, but NOT dropped.
  assert.deepEqual(unclassified, ['S-201']);
});

check('triage candidacy alone makes a sheet primary (signal (b) OR\'d with keyword detection)', () => {
  const { brandSheets, unclassified } = routeSheets([SKYFOLD_SHEET, STRUCTURAL_SHEET], {
    triageCandidates: { Skyfold: ['S-201'] },
  });
  const byNumber = new Map(brandSheets.get('Skyfold').map((s) => [s.sheetNumber, s]));
  assert.equal(byNumber.get('S-201').role, 'primary', 'triage-listed sheet must be primary even with no keyword on it');
  assert.deepEqual(unclassified, [], 'a triage-claimed sheet is no longer unclassified');
});

check('triage candidacy alone fires a specialist with zero keyword matches anywhere', () => {
  const noKeywordSheets = [STRUCTURAL_SHEET, { sheetNumber: 'M-101', revision: '0', text: 'Mechanical plan. Relief air requirement 2000 CFM at plenum opening.' }];
  const { brandSheets } = routeSheets(noKeywordSheets, { triageCandidates: { Airolite: ['M-101'] } });
  const airoliteInput = brandSheets.get('Airolite');
  assert.equal(airoliteInput.length, 2, 'Airolite must fire on triage signal alone and receive the full set');
  assert.equal(airoliteInput.find((s) => s.sheetNumber === 'M-101').role, 'primary');
  assert.equal(airoliteInput.find((s) => s.sheetNumber === 'S-201').role, 'context');
});

check('triage sheet-number matching tolerates spacing/case differences (normalizeSheetNumber contract)', () => {
  const { brandSheets } = routeSheets([STRUCTURAL_SHEET], { triageCandidates: { Skyfold: [' s- 201 '] } });
  assert.equal(brandSheets.get('Skyfold')[0]?.role, 'primary');
});

check('non-firing brands receive no sheets at all', () => {
  const { brandSheets } = routeSheets([SKYFOLD_SHEET, STRUCTURAL_SHEET]);
  assert.equal(brandSheets.get('Euro-Wall').length, 0);
  assert.equal(brandSheets.get('Smoke Guard').length, 0);
});

check('Skyfold detector: bare brand name with no model series still signals the brand', () => {
  assert.deepEqual(detectSkyfold('OPERABLE WALL: SKYFOLD, SEE SPEC SECTION 10 22 26'), ['SKYFOLD-GENERAL']);
  assert.deepEqual(detectSkyfold('STRUCTURAL FRAMING PLAN, NO PRODUCTS NAMED'), []);
});

check('Modernfold detector: bare "931" no longer false-positives without brand context + word boundary', () => {
  assert.deepEqual(detectModernfold('ROOM 931 CONFERENCE'), [], 'room number alone must not match');
  assert.deepEqual(detectModernfold('SPEC SECTION 09310 ACOUSTICAL PANELS, MODERNFOLD N/A HERE... 09310'), [], 'digits inside a longer number must not match');
  assert.deepEqual(detectModernfold('MODERNFOLD ACOUSTI-SEAL MODEL 931 OPERABLE PARTITION'), ['931'], 'brand-context + word-boundary match must still work');
});

check('multi-product sheets are based on primary roles for 2+ brands', () => {
  const shared = {
    sheetNumber: 'A-406',
    revision: '0',
    text: 'RCP: Skyfold Classic 60 divider; Airolite T6636 relief louver in the plenum above.',
  };
  const { multiProductSheets } = routeSheets([shared, STRUCTURAL_SHEET]);
  assert.equal(multiProductSheets.length, 1);
  assert.equal(multiProductSheets[0].sheetNumber, 'A-406');
  assert.deepEqual([...multiProductSheets[0].brands].sort(), ['Airolite', 'Skyfold']);
});

check('duplicate sheet numbers still detected and surfaced', () => {
  const dup = { ...STRUCTURAL_SHEET };
  const { duplicateSheetNumbers } = routeSheets([SKYFOLD_SHEET, STRUCTURAL_SHEET, dup]);
  assert.deepEqual(duplicateSheetNumbers, ['S-201']);
});

console.log(`\n${passed} routing checks passed.`);
