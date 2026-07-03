// Deterministic (no Claude call) correlation of sheets by shared tags/gridlines/cross-references.
// This is what lets a structural or electrical sheet that never names a brand still get pulled
// into that brand's specialist context, because it shares a tag or gridline with a sheet that does.

function normalizeKey(s) {
  return String(s).trim().toUpperCase();
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
    for (const ref of sheet.crossReferences || []) {
      if (ref.targetSheet) addRef(`SHEET:${ref.targetSheet}`, sheet.sheetNumber);
      addRef(`SHEET:${sheet.sheetNumber}`, sheet.sheetNumber);
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
      `SHEET:${sheetNumber}`,
      ...(sheet.crossReferences || []).map((r) => r.targetSheet && `SHEET:${r.targetSheet}`).filter(Boolean),
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
