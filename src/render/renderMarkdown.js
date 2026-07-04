// Turns runProjectSynthesis()'s structured report into an actual readable document. Deterministic
// formatting only — no LLM call, no paraphrasing, so every line stays exactly as cited by the
// specialist that produced it. This is the step flagged as "the collecting point of the agents'
// genius": five agents' structured findings in, one clean deliverable out.

function sheetTag(f) {
  return f.sheet_reference && f.sheet_reference !== 'UNSPECIFIED' ? ` / ${f.sheet_reference}` : '';
}

function renderFinding(f) {
  const escalated = f.escalated ? '**ESCALATED** — ' : '';
  let md = `- **[${f.brand}${sheetTag(f)}]** ${escalated}${f.description}\n`;
  md += `  - *Citation:* ${f.citation}\n`;
  if (f.consequence) md += `  - *Consequence:* ${f.consequence}\n`;
  if (f.demoted_from) md += `  - *Demoted from ${f.demoted_from}:* geometry-inferred — field-verify, never price from this.\n`;
  // Phase 3 reconciliation annotations, rendered where the PM reads (Phase 4).
  for (const c of f.corroborated_by || []) {
    md += `  - *Corroborated by ${c.brand}${c.sheet_reference && c.sheet_reference !== 'UNSPECIFIED' ? ` / ${c.sheet_reference}` : ''}:* ${c.description}\n`;
  }
  if (f.corroboration_note) md += `  - *Corroboration note:* ${f.corroboration_note}\n`;
  if (f.derived_value_flag) {
    md += `  - *⚠ Derived-value flag:* "${f.derived_value_flag.value}" — ${f.derived_value_flag.reason}\n`;
  }
  return md;
}

// RFI List (Phase 4): numbered ready-to-issue drafts, bid-gating items first (the report object
// already carries them in that order — this renderer only numbers and formats).
function renderRfiSection(section) {
  let md = '';
  if (!section.rfis.length) {
    md += `_No RFIs — no discrepancy or absence finding required one._\n\n`;
    return md;
  }
  section.rfis.forEach((r, i) => {
    const num = `RFI-${String(i + 1).padStart(2, '0')}`;
    md += `### ${num} — ${r.rfi_subject || '(no subject)'}${r.bid_gating ? ' **[BID-GATING]**' : ''}\n\n`;
    md += `- **References:** ${r.references.length ? r.references.join(', ') : '(none cited)'}\n`;
    md += `- **Question:** ${r.question}\n`;
    md += `- **Bid impact:** ${r.bid_impact}\n`;
    md += `- *Evidence type:* ${r.evidence_type} — *drafted by ${r.source === 'reconciler' ? 'reconciler from a' : 'the'} ${r.brand} ${r.source === 'reconciler' ? 'finding' : 'specialist'}*\n`;
    if (r.source_citation) md += `- *Underlying citation:* ${r.source_citation}\n`;
    md += `\n`;
  });
  return md;
}

// Risk Register (Phase 4): risk findings, plus the reconciler's contradictions, plus the folded-in
// Cross-Brand Watch content — one section, so cross-system risk isn't scattered.
function renderRiskRegisterSection(section) {
  let md = '';
  const empty = !section.findings.length && !(section.contradictions || []).length && !(section.crossBrandWatch || []).length;
  if (empty) {
    md += `_No findings in this category._\n\n`;
    return md;
  }
  for (const f of section.findings) md += renderFinding(f);
  if (section.findings.length) md += `\n`;

  if (section.contradictions?.length) {
    md += `### Contradictions (reconciler)\n\n_Sheets or findings that conflict — resolve before pricing the affected scope._\n\n`;
    for (const c of section.contradictions) {
      md += `- **[Sheets ${c.sheets.join(', ')}]** ${c.description}\n`;
      if (c.citation) md += `  - *Citation:* ${c.citation}\n`;
      md += `  - *Findings involved:* ${c.finding_ids.join(', ')}\n`;
    }
    md += `\n`;
  }

  if (section.crossBrandWatch?.length) {
    md += `### Cross-brand interactions\n\n_Sheets relevant to more than one brand — findings grouped by sheet so interactions between systems aren't buried in separate brand sections._\n\n`;
    for (const c of section.crossBrandWatch) {
      md += `**Sheet ${c.sheetNumber} (${c.brands.join(' + ')})**\n\n`;
      for (const f of c.findings) md += `- **[${f.brand}]** ${f.description}\n`;
      md += `\n`;
    }
  }
  return md;
}

// Unresolved Items (Phase 4): REQUIRED section — renders its "none" line rather than being
// omitted, so its absence from a report is itself a signal. gapCheck's referenced-but-missing
// sheets appear here, on page one, not only in the diagnostics appendix.
function renderUnresolvedSection(section) {
  const u = section.unresolved || {};
  const gaps = u.gapCheckGaps || [];
  const triage = u.unresolvedTriageCandidates || [];
  const ordering = u.orderingMismatches || [];
  const escalations = u.escalations || [];
  let md = '';
  if (!gaps.length && !triage.length && !ordering.length && !escalations.length) {
    md += `None — all required conditions accounted for.\n\n`;
    return md;
  }
  if (escalations.length) {
    md += `### Escalated absences (required sheet type missing from the set entirely)\n\n`;
    for (const e of escalations) {
      const f = e.finding || {};
      md += `- **[${f.brand || 'Unknown'}]** ${f.description || `Finding ${e.finding_id}`}\n`;
      md += `  - *Missing sheet types:* ${(e.missing_sheet_types || []).join('; ') || '(unspecified)'}\n`;
      if (e.rationale) md += `  - *Rationale:* ${e.rationale}\n`;
      if (f.citation) md += `  - *Citation:* ${f.citation}\n`;
    }
    md += `\n`;
  }
  if (gaps.length) {
    md += `### Sheets referenced but missing from this set\n\n_These sheets are cited by sheets in the set but were not extracted — scope living on them is invisible to this report._\n\n`;
    for (const gap of gaps) {
      md += `- **${gap.targetSheet}** — referenced by ${gap.referencedBy.map((r) => r.fromSheet).join(', ')}\n`;
    }
    md += `\n`;
  }
  if (triage.length) {
    md += `### Unresolved triage candidates\n\n_Triage named these sheet numbers but they couldn't be mapped to a page:_ ${triage.join(', ')}\n\n`;
  }
  if (ordering.length) {
    md += `### Ordering mismatches\n\n_Sheet numbering did not land where the index said it would — treat citations to these pages with caution._\n\n`;
    for (const m of ordering) {
      md += `- Page ${m.pageIndex}: expected "${m.expected}", got "${m.actual}"\n`;
    }
    md += `\n`;
  }
  return md;
}

function renderFindingsSection(section) {
  let md = '';
  if (!section.findings.length) {
    md += `_No findings in this category._\n\n`;
    return md;
  }
  for (const f of section.findings) md += renderFinding(f);
  md += `\n`;
  return md;
}

function renderSection(section) {
  let md = `## ${section.title}\n\n`;
  switch (section.key) {
    case 'rfi_list':
      return md + renderRfiSection(section);
    case 'risk_register':
      return md + renderRiskRegisterSection(section);
    case 'unresolved':
      return md + renderUnresolvedSection(section);
    default:
      return md + renderFindingsSection(section);
  }
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

  // The bid qualification package: sections 1-6 in the work order's contractual order (then
  // estimating flags / critical path, which are bid-time but unplaced by the work order's list).
  // Cross-Brand Watch renders inside Risk Register now, not as its own section.
  for (const section of report.sections) {
    md += renderSection(section);
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
    md += `- ${b.findings.length} finding(s) — full detail in the sections above; listed here with evidence types:\n`;
    for (const f of b.findings) {
      md += `  - [${f.finding_type || 'untyped'} / ${f.evidence_type || 'no evidence_type'}${f.sheet_reference ? ` / ${f.sheet_reference}` : ''}] ${f.description || ''}\n`;
    }
    md += `\n`;
  }

  // Install-phase appendix sections (preconstruction checklist, installation briefing) — kept out
  // of the qualification package above.
  for (const section of report.appendixSections || []) {
    md += `## Appendix: ${section.title}\n\n`;
    md += renderFindingsSection(section);
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
