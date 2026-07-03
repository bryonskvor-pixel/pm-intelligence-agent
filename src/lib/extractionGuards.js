// Deterministic post-processing guards applied to raw per-sheet extraction output, before it
// feeds the tag index or any specialist. These exist because raw extraction proved reliable at
// transcribing legible text/notes but unreliable in two specific, identifiable ways: repeated
// graphical symbols get read as if they were distinct text tags, and multi-tier schedule tables
// can lose column/row alignment. Both are caught here and flagged rather than silently trusted.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countOccurrences(text, token) {
  if (!text || !token) return 0;
  const re = new RegExp(`\\b${escapeRegex(token)}\\b`, 'g');
  return (text.match(re) || []).length;
}

// A real room/equipment/wall tag on a sheet should appear a handful of times at most (once on
// the plan graphic, maybe again in a schedule row). A tag appearing far more often than that is
// almost certainly a repeated graphical symbol (hatch pattern label, fixture glyph, etc.) that
// got transcribed as literal text on every occurrence, not a distinct meaningful identifier.
export function filterNoisyTags(sheet, { maxOccurrences = 6 } = {}) {
  const tags = sheet.tags || [];
  const kept = [];
  const droppedAsNoise = [];

  for (const tag of tags) {
    const count = countOccurrences(sheet.rawText || '', tag);
    if (count > maxOccurrences) {
      droppedAsNoise.push({ tag, occurrences: count });
    } else {
      kept.push(tag);
    }
  }

  return { ...sheet, tags: kept, extractionWarnings: [...(sheet.extractionWarnings || []), ...droppedAsNoise.map((d) => ({
    type: 'noisy_tag_dropped',
    detail: `Tag "${d.tag}" appeared ${d.occurrences} times on this sheet — treated as a repeated graphical symbol, not a distinct identifier, and excluded from tags/correlation.`,
  }))] };
}

// Flags (does not attempt to auto-correct) schedules where a row's value count doesn't match
// the declared column count — a sign the source table had merged/multi-tier headers that didn't
// flatten correctly. Auto-fixing would mean guessing which column absorbed the extra value,
// which risks silently mislabeling real numbers — worse than just flagging it for re-review.
export function validateSchedules(sheet) {
  const warnings = [];
  const schedules = (sheet.schedules || []).map((schedule) => {
    const columnCount = (schedule.columns || []).length;
    const mismatchedRows = (schedule.rows || [])
      .map((row, i) => ({ index: i, length: row.length }))
      .filter((r) => r.length !== columnCount);

    if (mismatchedRows.length) {
      warnings.push({
        type: 'schedule_column_mismatch',
        detail: `Schedule "${schedule.name}" declares ${columnCount} columns but ${mismatchedRows.length} row(s) have a different value count (rows: ${mismatchedRows
          .map((r) => `#${r.index}=${r.length}`)
          .join(', ')}). Values in this schedule should not be trusted for citation until re-verified.`,
      });
      return { ...schedule, columnMismatch: true };
    }
    return schedule;
  });

  return { ...sheet, schedules, extractionWarnings: [...(sheet.extractionWarnings || []), ...warnings] };
}

export function applyExtractionGuards(sheets, options = {}) {
  return sheets.map((sheet) => validateSchedules(filterNoisyTags(sheet, options)));
}
