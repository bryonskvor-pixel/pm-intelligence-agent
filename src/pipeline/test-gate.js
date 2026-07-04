// Phase 5 acceptance test — PM confirmation gate. Deterministic, zero API cost, no env needed:
// everything here exercises the pure manifest logic plus the gate check, which throws before
// any API call could happen.
//
// Acceptance (from the work order): pipeline cannot reach extraction of candidate pages without
// a confirmed manifest object; edited manifests are honored — and "honored" means BOTH consumers
// of the per-brand candidate lists move together: the page set selected for extraction AND the
// triageCandidates routing signal handed to synthesis.
import {
  buildManifest,
  resolveManifestSelections,
  confirmManifest,
  executePipeline,
} from './runFromPdf.js';

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// A plan-shaped manifest as planPipeline would build it: index on page 0, listing starts at
// physical page 1, Skyfold triaged to A-405 plus the structural sheet S-201, Airolite to M-101.
const TRIAGE_RESULT = {
  orderedSheetNumbers: ['G-001', 'A-101', 'A-405', 'S-201', 'M-101', 'E-101'],
  Modernfold: { candidateSheetNumbers: [], reasoning: null },
  Skyfold: { candidateSheetNumbers: ['A-405', 'S-201'], reasoning: 'operable wall on A-405; structural support S-201' },
  'Euro-Wall': { candidateSheetNumbers: [], reasoning: null },
  Airolite: { candidateSheetNumbers: ['M-101'], reasoning: 'mechanical schedule' },
  'Smoke Guard': { candidateSheetNumbers: [], reasoning: null },
};
const INDEX_SHEET = { sheetNumber: 'G-000', pageIndex: 0, rawText: 'SHEET INDEX ...' };

function freshManifest() {
  return buildManifest({
    indexPageIndex: 0,
    triageResult: TRIAGE_RESULT,
    indexSheet: INDEX_SHEET,
    planUsage: { index: {}, triage: {} },
  });
}

async function rejects(promiseFn) {
  try {
    await promiseFn();
    return null;
  } catch (err) {
    return err;
  }
}

console.log('--- Gate: extraction unreachable without confirmation ---');

// (a) An unconfirmed manifest — the exact object planPipeline returns — is rejected. No env
// vars are loaded for this test, so if executePipeline attempted an API call before the gate
// check, it would fail with a missing-key/network error instead of the gate message.
{
  const err = await rejects(() => executePipeline(Buffer.from('not a real pdf'), freshManifest()));
  check('unconfirmed manifest rejected', err !== null);
  check('rejection is the gate, not a downstream failure', /confirmed manifest/i.test(err?.message || ''), err?.message);
}

// A hand-forged "confirmed" flag doesn't pass — only confirmManifest() can mark a manifest.
{
  const forged = { ...freshManifest(), confirmed: true, pmConfirmed: true };
  const err = await rejects(() => executePipeline(Buffer.from('x'), forged));
  check('hand-forged confirmation flag rejected', err !== null && /confirmed manifest/i.test(err.message));
}

{
  const err = await rejects(() => executePipeline(Buffer.from('x'), null));
  check('missing manifest rejected', err !== null && /confirmed manifest/i.test(err.message));
}

console.log('\n--- Manifest resolution: baseline ---');

{
  const base = resolveManifestSelections(freshManifest());
  // A-405 is listing position 2 → page 3; S-201 position 3 → page 4; M-101 position 4 → page 5.
  check(
    'baseline page set from triage candidates',
    JSON.stringify(base.pagesToExtract) === JSON.stringify([3, 4, 5]),
    `got [${base.pagesToExtract}]`
  );
  check(
    'baseline triageCandidates mirror the manifest lists',
    JSON.stringify(base.triageCandidates.Skyfold) === JSON.stringify(['A-405', 'S-201']) &&
      JSON.stringify(base.triageCandidates.Airolite) === JSON.stringify(['M-101'])
  );
  check('no unresolved candidates at baseline', base.unresolvedCandidates.length === 0);
}

console.log('\n--- Edited manifests are honored, in BOTH consumers ---');

// (b) PM adds a candidate sheet (the electrical sheet for Skyfold): it must join the extracted
// page set AND the Skyfold routing signal — extraction without routing means the specialist
// never fires on it, which is exactly the Phase 1 failure mode this gate must not reintroduce.
{
  const edited = freshManifest();
  edited.perBrandCandidates.Skyfold.push('E-101');
  const res = resolveManifestSelections(edited);
  check(
    'added sheet joins the page set',
    JSON.stringify(res.pagesToExtract) === JSON.stringify([3, 4, 5, 6]),
    `got [${res.pagesToExtract}]`
  );
  check(
    'added sheet joins the routing signal',
    res.triageCandidates.Skyfold.includes('E-101')
  );
}

// (c) PM removes a candidate sheet: gone from both.
{
  const edited = freshManifest();
  edited.perBrandCandidates.Skyfold = ['A-405']; // S-201 removed
  const res = resolveManifestSelections(edited);
  check(
    'removed sheet leaves the page set',
    JSON.stringify(res.pagesToExtract) === JSON.stringify([3, 5]),
    `got [${res.pagesToExtract}]`
  );
  check(
    'removed sheet leaves the routing signal',
    !res.triageCandidates.Skyfold.includes('S-201')
  );
}

// A PM-added sheet that isn't in the index listing can't be mapped to a page — it must surface
// as unresolved, not vanish.
{
  const edited = freshManifest();
  edited.perBrandCandidates.Airolite.push('M-999');
  const res = resolveManifestSelections(edited);
  check(
    'unmappable added sheet surfaces as unresolved',
    res.unresolvedCandidates.includes('M-999')
  );
}

// A sheet shared by two brands extracts its page once but appears in both routing lists.
{
  const edited = freshManifest();
  edited.perBrandCandidates['Smoke Guard'] = ['S-201'];
  const res = resolveManifestSelections(edited);
  check(
    'sheet shared across brands extracts once, routes to both',
    JSON.stringify(res.pagesToExtract) === JSON.stringify([3, 4, 5]) &&
      res.triageCandidates['Smoke Guard'].includes('S-201') &&
      res.triageCandidates.Skyfold.includes('S-201')
  );
}

console.log('\n--- Confirmation semantics ---');

// confirmManifest snapshots the edited lists; the confirmed object is frozen so curation
// happens before confirmation, never after.
{
  const edited = freshManifest();
  edited.perBrandCandidates.Skyfold.push('E-101');
  const confirmed = confirmManifest(edited);
  check(
    'confirmation preserves edits',
    resolveManifestSelections(confirmed).triageCandidates.Skyfold.includes('E-101')
  );
  let mutated = true;
  try {
    confirmed.perBrandCandidates.Skyfold.push('A-101');
  } catch {
    mutated = false;
  }
  check(
    'confirmed manifest is immutable',
    !mutated || !confirmed.perBrandCandidates.Skyfold.includes('A-101')
  );
}

// confirmManifest refuses a manifest that lost its planning-time index sheet — execution would
// otherwise have to re-extract (re-pay for) the index page.
{
  const stripped = { ...freshManifest(), indexSheet: null };
  let err = null;
  try {
    confirmManifest(stripped);
  } catch (e) {
    err = e;
  }
  check('manifest without its index sheet cannot be confirmed', err !== null && /index sheet/i.test(err.message));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
