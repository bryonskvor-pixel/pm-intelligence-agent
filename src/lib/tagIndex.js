// Deterministic (no Claude call) correlation of sheets by shared tags/gridlines/cross-references.
// This is what lets a structural or electrical sheet that never names a brand still get pulled
// into that brand's specialist context, because it shares a tag or gridline with a sheet that does.

import { normalizeSheetNumber } from './sheetNumber.js';

// Loose normalization for tags/gridlines — deliberately preserves internal whitespace, since
// these can be multi-word ("NURSING LAB 155"), unlike sheet numbers.
function normalizeKey(s) {
  return String(s).trim().toUpperCase();
}

// SHEET:<number> composite keys specifically need the stricter sheet-number normalizer (strips
// all whitespace), not the loose tag normalizer above. The sheet-number portion of this key can
// come from crossReferences.targetSheet — freeform LLM transcription of "SEE X-XXX" notation,
// which can plausibly have irregular spacing ("S- 501") that the loose normalizer would leave
// intact, silently failing to match the clean "S-501" key built from a sheet's own sheetNumber.
function buildSheetKey(sheetNumber) {
  return `SHEET:${normalizeSheetNumber(sheetNumber)}`;
}

// extractedSheets: output of extractSheetsFromPdf — one object per sheet with tags/gridlines/crossReferences.
// Returns a Map from normalized tag/gridline key -> Set of sheetNumbers that reference it.
//
// Prunes tag/gridline keys shared across an implausibly large share of all sheets before
// returning. Real, tested-at-scale finding: bare partition-type numbers ("3", "4", "5", "6")
// and bare gridline letters ("A"-"E") showed up as "shared tags" across a third of a real
// 62-sheet set — they're legend/grid references reused on nearly every sheet, not distinctive
// identifiers, and left unfiltered they made one-hop correlation pull in almost everything.
// Explicit "SEE X-XXX" cross-references are exempt — those are deliberate authored references,
// not incidentally-repeated short tokens, so high sharing there is a legitimate signal.
export function buildTagIndex(extractedSheets, { maxShareRatio = 0.15, minShareFloor = 5 } = {}) {
  const index = new Map();

  const addRef = (key, sheetNumber) => {
    if (!key || !sheetNumber) return;
    const k = normalizeKey(key);
    if (!index.has(k)) index.set(k, new Set());
    index.get(k).add(sheetNumber);
  };

  for (const sheet of extractedSheets) {
    if (!sheet.sheetNumber) continue;
    for (const tag of sheet.tags || []) addRef(tag, sheet.sheetNumber);
    for (const gridline of sheet.gridlines || []) addRef(gridline, sheet.sheetNumber);
    // Register every sheet's own SHEET: key unconditionally — this was previously nested inside
    // the crossReferences loop, so a sheet with zero outgoing references (e.g. a purely-referenced
    // structural sheet) never got its own key registered and could never be a correlation target.
    addRef(buildSheetKey(sheet.sheetNumber), sheet.sheetNumber);
    for (const ref of sheet.crossReferences || []) {
      if (ref.targetSheet) addRef(buildSheetKey(ref.targetSheet), sheet.sheetNumber);
    }
  }

  const totalSheets = new Set(extractedSheets.map((s) => s.sheetNumber).filter(Boolean)).size;
  const maxShare = Math.max(minShareFloor, Math.ceil(totalSheets * maxShareRatio));
  for (const [key, sheetSet] of [...index.entries()]) {
    if (!key.startsWith('SHEET:') && sheetSet.size > maxShare) {
      index.delete(key);
    }
  }

  return index;
}

// One-hop correlation only: a sheet is "inferred" if it shares a tag/gridline/cross-reference
// with a sheet that directly matched, but does not itself directly match. No transitive chaining —
// every inferred sheet is one hop from a direct match, so it stays auditable.
export function correlateOneHop(directSheetNumbers, tagIndex, allSheetsByNumber) {
  const direct = new Set(directSheetNumbers);
  const inferred = new Set();
  const inferredVia = new Map(); // sheetNumber -> [{ key, fromSheet }]

  for (const sheetNumber of direct) {
    const sheet = allSheetsByNumber.get(sheetNumber);
    if (!sheet) continue;
    const keys = [
      ...(sheet.tags || []),
      ...(sheet.gridlines || []),
      buildSheetKey(sheetNumber),
      ...(sheet.crossReferences || []).map((r) => r.targetSheet && buildSheetKey(r.targetSheet)).filter(Boolean),
    ];
    for (const key of keys) {
      const k = normalizeKey(key);
      const sharers = tagIndex.get(k);
      if (!sharers) continue;
      for (const candidate of sharers) {
        if (direct.has(candidate)) continue;
        inferred.add(candidate);
        if (!inferredVia.has(candidate)) inferredVia.set(candidate, []);
        inferredVia.get(candidate).push({ key: k, fromSheet: sheetNumber });
      }
    }
  }

  return { direct: [...direct], inferred: [...inferred], inferredVia };
}
