// Structural (non-LLM) check for whether a fed/curated set of sheets is missing something it
// itself references. Every extracted sheet already carries crossReferences with a targetSheet —
// if a sheet inside the fed set points to a sheet number that isn't also in the fed set, that's
// not a judgment call, it's a hard membership check. Catches gaps whether they came from a human
// hand-curating a page subset or an automated triage pass missing something.

import { normalizeSheetNumber } from './sheetNumber.js';

// Real construction sheet numbers in this project's (and most projects') convention look like
// "A-405", "S501", "M-3", "E-6.1" — a short discipline-letter prefix followed by a digit. Code
// citations ("404.2.3.3"), table/figure references ("Table 703.2.4", "FIG. 610.2"), and generic
// terms ("RCP", "schedule") don't match that shape. The extraction agent's crossReferences field
// captures both kinds indiscriminately (it's transcribing "see X" language faithfully, which is
// correct), so this is what keeps the gap check's signal from being drowned by citation noise.
//
// Deliberately unanchored (searches anywhere in the string, not just the start): compound
// reference notation like "SIM 3/A-601" — the exact example extraction.js's own system prompt
// documents as valid crossReferences input — has the real sheet number embedded mid-string, not
// at position 0. An anchored match would silently reject this and every reference like it.
// Accepted tradeoff: this can also match a short standards citation shaped like a sheet number
// (e.g. "ASTM E90"). That's a low-cost false positive — a human glancing at the gap list
// recognizes it immediately — versus the higher-cost alternative of a false negative silently
// dropping a real, referenced-but-missing sheet from the check meant to catch exactly that.
const SHEET_NUMBER_PATTERN = /[A-Z]{1,4}-?\d[\dA-Z.]*/i;

function extractSheetNumberCandidate(target) {
  const match = String(target).trim().match(SHEET_NUMBER_PATTERN);
  return match ? match[0] : null;
}

// fedSheets: the subset of extracted sheet objects actually being used for a run (could be all
// of them, or a curated/triaged subset). Returns every crossReference whose targetSheet contains
// a real-sheet-number-shaped substring not present in that same fed set, grouped by the missing target.
export function findMissingCrossReferences(fedSheets) {
  const fedNumbers = new Set(fedSheets.map((s) => normalizeSheetNumber(s.sheetNumber)).filter(Boolean));
  const gapsByTarget = new Map();
  let excludedCount = 0;

  for (const sheet of fedSheets) {
    for (const ref of sheet.crossReferences || []) {
      if (!ref.targetSheet) continue;
      const candidate = extractSheetNumberCandidate(ref.targetSheet);
      if (!candidate) {
        excludedCount++;
        continue;
      }
      const targetKey = normalizeSheetNumber(candidate);
      if (fedNumbers.has(targetKey)) continue;

      if (!gapsByTarget.has(targetKey)) gapsByTarget.set(targetKey, { targetSheet: ref.targetSheet, referencedBy: [] });
      gapsByTarget.get(targetKey).referencedBy.push({ fromSheet: sheet.sheetNumber, context: ref.context });
    }
  }

  return { gaps: [...gapsByTarget.values()], excludedNonSheetReferences: excludedCount };
}
