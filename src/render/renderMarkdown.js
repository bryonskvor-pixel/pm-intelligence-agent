// Turns runProjectSynthesis()'s structured report into an actual readable document. Deterministic
// formatting only — no LLM call, no paraphrasing, so every line stays exactly as cited by the
// specialist that produced it. This is the step flagged as "the collecting point of the agents'
// genius": five agents' structured findings in, one clean deliverable out.

function sheetTag(f) {
  return f.sheet_reference && f.sheet_reference !== 'UNSPECIFIED' ? ` / ${f.sheet_reference}` : '';
}

function renderFinding(f) {
  let md = `- **[${f.brand}${sheetTag(f)}]** ${f.description}\n`;
  md += `  - *Citation:* ${f.citation}\n`;
  if (f.consequence) md += `  - *Consequence:* ${f.consequence}\n`;
  return md;
}

// report: the object returned by runProjectSynthesis() (or runPipelineFromPdf().report).
// opts.projectName / opts.generatedAt: optional header metadata.
// opts.diagnostics: optional — pass { triage, orderingMismatches, gapCheck, pagesExtracted,
// usageTotals } to append an internal QA appendix, kept clearly separate from the PM-facing
// findings above it. usageTotals must already be a computed summary (sumUsageStages(...) plus
// estimatedCostUSD: estimateCostUSD(...)) — this module displays a number, it never derives one.
export function renderReportMarkdown(report, { projectName, generatedAt, diagnostics } = {}) {
  let md = `# ${projectName || 'Project'} — PM Intelligence Report\n\n`;
  if (generatedAt) md += `_Generated ${generatedAt}_\n\n`;

  if (report.duplicateSheetNumbers?.length) {
    md += `> **⚠ Data quality warning:** sheet number(s) ${report.duplicateSheetNumbers.join(', ')} appeared on more than one extracted page — a real extraction defect, not a routing issue. Findings and Cross-Brand Watch entries under these sheet numbers may combine two unrelated physical pages. Verify against the source print before relying on citations to these sheet numbers.\n\n`;
  }

  for (const section of report.sections) {
    md += `## ${section.title}\n\n`;
    if (!section.findings.length) {
      md += `_No findings in this category._\n\n`;
      continue;
    }
    for (const f of section.findings) md += renderFinding(f);
    md += `\n`;
  }

  if (report.crossBrandWatch.length) {
    md += `## Cross-Brand Watch\n\n`;
    md += `Sheets relevant to more than one brand — findings below are grouped by sheet so interactions between systems aren't buried in separate brand sections.\n\n`;
    for (const c of report.crossBrandWatch) {
      md += `### Sheet ${c.sheetNumber} (${c.brands.join(' + ')})\n\n`;
      for (const f of c.findings) md += `- **[${f.brand}]** ${f.description}\n`;
      md += `\n`;
    }
  }

  md += `## Brand Appendix\n\n`;
  if (!report.brandAppendix.length) {
    md += `_No brand specialists ran — no sheet matched any of the 5 brands._\n\n`;
  }
  for (const b of report.brandAppendix) {
    md += `### ${b.brand}\n\n`;
    if (b.primarySheets || b.contextSheets) {
      md += `- Primary sheets (product specified or triage-flagged): ${(b.primarySheets || []).join(', ') || '(none)'}\n`;
      md += `- Context sheets (rest of the set, reviewed for hidden requirements): ${(b.contextSheets || []).join(', ') || '(none)'}\n`;
    } else {
      md += `- Sheets used: ${b.sheetsUsed.join(', ') || '(none)'}\n`;
    }
    md += `- Models detected: ${(b.modelIdsDetected || []).join(', ') || '(none)'}\n`;
    if (b.pdfPagesAttached?.length) {
      md += `- Drawing pages reviewed as PDF (graphics, not just text): ${b.pdfPagesAttached.join(', ')}\n`;
    }
    md += `- ${b.findings.length} finding(s) — see sections above for full detail.\n\n`;
  }

  if (report.unclassifiedSheets.length) {
    md += `## Unclassified Sheets\n\n`;
    md += `Primary for none of the 5 brands (no keyword or triage match). Still provided to every firing specialist as context — listed here for awareness, not dropped: ${report.unclassifiedSheets.join(', ')}\n\n`;
  }

  if (diagnostics) {
    md += renderDiagnosticsMarkdown(diagnostics);
  }

  return md;
}

// diagnostics: { triage, orderingMismatches, gapCheck, pagesExtracted, usageTotals } — usageTotals
// is a pre-computed summary (see renderReportMarkdown's doc comment above), everything else comes
// straight from runPipelineFromPdf()'s return value. Internal QA record of how the report was
// produced, not itself a PM deliverable — kept in a clearly separated section for that reason.
export function renderDiagnosticsMarkdown(diagnostics) {
  let md = `---\n\n## Appendix: Pipeline Diagnostics\n\n_Internal record of how this report was produced — not part of the findings above._\n\n`;

  if (diagnostics.pagesExtracted) {
    md += `**Pages extracted:** ${diagnostics.pagesExtracted.length} (of the full document) — ${diagnostics.pagesExtracted.join(', ')}\n\n`;
  }

  if (diagnostics.triage) {
    md += `### Triage candidates\n\n`;
    for (const [brand, data] of Object.entries(diagnostics.triage.perBrand || {})) {
      if (brand === 'unclassifiedSheetNumbers' || brand === 'orderedSheetNumbers') continue;
      md += `- **${brand}:** ${(data.candidateSheetNumbers || []).join(', ') || '(none)'} — _${data.reasoning || ''}_\n`;
    }
    if (diagnostics.triage.unresolvedCandidates?.length) {
      md += `\nUnresolved candidates (sheet number triage named but couldn't map to a page): ${diagnostics.triage.unresolvedCandidates.join(', ')}\n`;
    }
    md += `\n`;
  }

  if (diagnostics.orderingMismatches?.length) {
    md += `### Ordering heuristic mismatches\n\n_Index-order-to-page-position assumption broke down for these pages — treat this run's sheet numbering with extra caution._\n\n`;
    for (const m of diagnostics.orderingMismatches) {
      md += `- Page ${m.pageIndex}: expected "${m.expected}", got "${m.actual}"\n`;
    }
    md += `\n`;
  }

  if (diagnostics.extractionWarnings?.length) {
    md += `### Extraction warnings\n\n_Per-sheet guard flags — noisy tags dropped, misaligned schedules, suspiciously thin extractions. Verify flagged sheets against the source print before relying on citations to them._\n\n`;
    for (const w of diagnostics.extractionWarnings) {
      md += `- **${w.sheetNumber || `page ${w.pageIndex}`}** [${w.type}]: ${w.detail}\n`;
    }
    md += `\n`;
  }

  if (diagnostics.gapCheck) {
    md += `### Gap check\n\n`;
    if (!diagnostics.gapCheck.gaps.length) {
      md += `No sheets referenced but missing from the extracted set.\n\n`;
    } else {
      md += `**${diagnostics.gapCheck.gaps.length} sheet(s) referenced but not extracted — verify these weren't missed:**\n\n`;
      for (const gap of diagnostics.gapCheck.gaps) {
        md += `- ${gap.targetSheet}, referenced by ${gap.referencedBy.map((r) => r.fromSheet).join(', ')}\n`;
      }
      md += `\n`;
    }
  }

  if (diagnostics.usageTotals) {
    // Pricing is computed exactly once, upstream (src/lib/extraction.js's estimateCostUSD) — this
    // module only ever displays a number it's handed, never derives cost itself. Keeping pricing
    // knowledge in one place is what a prior duplicated-and-drifted copy of this exact formula cost:
    // a silently wrong (too-low) cost estimate once prompt caching activated.
    const { inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, estimatedCostUSD } = diagnostics.usageTotals;
    md += `### Usage\n\n`;
    md += `${inputTokens.toLocaleString()} input tokens, ${outputTokens.toLocaleString()} output tokens`;
    if (cacheCreationInputTokens || cacheReadInputTokens) {
      md += ` (cache write ${cacheCreationInputTokens.toLocaleString()}, cache read ${cacheReadInputTokens.toLocaleString()})`;
    }
    md += ` — est. $${estimatedCostUSD.toFixed(3)} (rough, verify current pricing)\n\n`;
  }

  return md;
}
