// Phase 3 (Remediation Work Order): the reconciliation agent. Runs after the specialists
// complete and before sectioning — one Sonnet call over ALL specialists' findings plus the sheet
// inventory, gap-check results, multi-product sheet list, and the required-conditions rows the
// specialists checked. It relates, merges, escalates, and culls what the specialists produced;
// it NEVER invents a finding. That invariant is enforced deterministically after the call: every
// finding id the model returns is validated against the real finding list, and anything citing
// an unknown id is dropped with a warning rather than trusted.
//
// Its jobs (work order Phase 3):
// 1. Contradictions — findings that conflict across brands or across sheets (also same-brand,
//    e.g. a schedule vs. a plan disagreeing).
// 2. Corroborations — two specialists independently flagging the same underlying condition,
//    merged into one strengthened finding. dedupeFindings only catches identical text; this
//    catches the same condition phrased two ways. The kept finding's text is NEVER rewritten
//    (no paraphrasing — same philosophy as findingsGuard/extractionGuards); the merged findings
//    are attached to it as corroborated_by so nothing disappears without a trace.
// 3. Escalations — ABSENCE findings whose where_expected sheet types are missing from the
//    extracted set entirely (absence of the sheet, not just absence on the sheet). These become
//    top-severity Unresolved Items when Phase 4 reshapes the report.
// 4. Generic-filler cull — drop findings a general-purpose model would produce without any
//    product-specific knowledge ("coordinate with GC"). Defensibility is enforced here, at one
//    chokepoint, rather than policed in five prompts. Culled findings are recorded in full, not
//    silently deleted.
// 5. Derived-value flags — residual quantity-prohibition leakage (computed percentages, unit
//    conversions, arithmetic the model did) that survived the specialist prompts. Annotation
//    only: the finding stays, flagged for review, never rewritten.
// 6. RFI generation (Phase 4) — every discrepancy/absence finding becomes a ready-to-issue RFI
//    draft (rfi_subject / references / question / bid_impact / bid_gating) unless the specialist
//    already drafted one (finding_type "rfi"). Each RFI's source finding id is validated and its
//    evidence_type is inherited from the real finding, never trusted from the model.

import Anthropic from '@anthropic-ai/sdk';
import { callAndParseJson } from '../lib/callAndParseJson.js';

const SYSTEM_PROMPT = `You are the reconciliation agent in a multi-brand construction PM intelligence system. Five brand specialists (Skyfold, Modernfold, Euro-Wall, Airolite, Smoke Guard) have produced findings from a project's drawing set. Your job is to relate, merge, escalate, and cull those findings. You NEVER invent a finding, a condition, or a value that is not already present in the input — you only work with what the specialists produced and what the mechanical gap check found.

You are given:
1. FINDINGS — every specialist finding, each with a stable id ("F1", "F2", ...), its brand, finding_type, description, citation, sheet_reference, and evidence_type.
2. SHEET INVENTORY — every sheet in the extracted set: number, title, discipline. This is the complete set the specialists saw.
3. GAP CHECK — sheets referenced by the set but absent from it (mechanical set-difference, may be marked unavailable).
4. MULTI-PRODUCT SHEETS — sheets where two or more brands' products co-locate.
5. REQUIRED CONDITIONS — the required-conditions rows (with where_expected sheet types) the specialists verified, brand-tagged.

You have exactly six jobs:

1. CONTRADICTIONS: identify findings whose cited contents conflict — across brands, across sheets, or same-brand across sheets (e.g. a schedule and a plan disagreeing, two sheets stating different criteria for the same element). Each entry cites the conflicting finding ids and every sheet involved. Quote the conflicting values exactly as the findings state them; never compute the difference between them.

2. CORROBORATIONS: identify sets of findings that flag the SAME underlying physical condition — typically two specialists describing one conflict from each brand's perspective, or one specialist repeating a condition in two sections with different phrasing. Choose the most specific, complete finding as keep_id and list the others as merged_ids. Only merge findings that describe the same underlying condition on the same element/location — similar topics on different elements are NOT corroborations.

3. ESCALATIONS: for each finding with evidence_type "ABSENCE", check its required condition's where_expected sheet types against the SHEET INVENTORY. If the discipline/sheet type where the condition should live has NO sheet in the inventory at all (the sheet itself is missing, not just the condition missing from a provided sheet), escalate it. State which sheet types are missing.

4. GENERIC-FILLER CULL: cull any finding a general-purpose model would produce with no product-specific knowledge — "coordinate with GC", "verify dimensions in field", "review submittals carefully" with no product-specific trigger, tolerance, or consequence behind it. A finding grounded on a real parameter, a real sheet condition, or a real required-condition row is NOT filler even if briefly phrased. When in doubt, keep.

5. DERIVED-VALUE FLAGS: flag any finding whose text contains a value the specialist computed rather than quoted — computed percentage differences, unit conversions, arithmetic illustrations, computed areas. Values quoted verbatim from a sheet or the parameter store are fine. Flagging does not remove the finding; it marks it for review.

6. RFI GENERATION: for every finding that states a discrepancy (conflicting values across sheets, or a drawn value conflicting with the parameter store — including every contradiction you identified in job 1) or an absence (evidence_type "ABSENCE"), draft a ready-to-issue RFI. Skip a finding only if it already has finding_type "rfi" (the specialist drafted the RFI itself) or an RFI you already drafted asks the same question. When you have merged findings in job 2, draft the RFI against the keep_id finding, not a merged-away one. Each RFI carries:
   - "source_finding_id": the finding it comes from.
   - "rfi_subject": a one-line subject as it would appear on the RFI form.
   - "references": the specific sheets/details/schedule cells in question, verbatim sheet numbers, as an array.
   - "question": the precise question to the architect/engineer. It must be answerable — "please clarify" alone is not a question. The quantity prohibition applies with full force: the RFI asks what the value or condition is, it NEVER proposes what it should be.
   - "bid_impact": what cannot be priced, or must be qualified/excluded, until this is answered.
   - "bid_gating": true when pricing is blocked or the proposal must carry an exclusion until this is answered; false for housekeeping clarifications.

Output a single JSON object, exactly this shape:
{
  "contradictions": [{ "finding_ids": ["F1", "F2"], "sheets": ["A-405", "S-201"], "description": "...", "citation": "..." }],
  "corroborations": [{ "keep_id": "F3", "merged_ids": ["F4"], "note": "..." }],
  "escalations": [{ "finding_id": "F6", "missing_sheet_types": ["electrical (E) sheets"], "rationale": "..." }],
  "culls": [{ "finding_id": "F5", "reason": "..." }],
  "derived_value_flags": [{ "finding_id": "F7", "value": "...", "reason": "..." }],
  "rfis": [{ "source_finding_id": "F6", "rfi_subject": "...", "references": ["S-201"], "question": "...", "bid_impact": "...", "bid_gating": true }]
}
Every array may be empty. Every finding_id you output MUST be an id present in FINDINGS — ids you invent are discarded. Cite sheets by their sheet numbers exactly as given.
The quantity prohibition applies to your own output: never state a quantity, dimension, or computed value in your descriptions, notes, or rationales — quote the findings' own wording instead.
Output must be valid JSON: when writing inch measurements inside string values, always write "in." instead of the " symbol.
Respond with ONLY the JSON object, no prose, no markdown code fences.`;

const MODEL = 'claude-sonnet-4-5-20250929';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Deterministic guard between the model's raw reconciliation and anything the report trusts:
// validates every referenced finding id, applies merges/culls/annotations, and records a warning
// for every entry it had to drop or adjust. The model proposes; this function disposes.
function applyReconciliation(findings, raw) {
  const warnings = [];
  const byId = new Map(findings.map((f) => [f.id, f]));
  const removed = new Set(); // ids merged away or culled

  const validIds = (ids, context) => {
    const ok = asArray(ids).filter((id) => {
      if (byId.has(id)) return true;
      warnings.push({ type: 'unknown_finding_id', detail: `${context} referenced unknown finding id ${JSON.stringify(id)} — ignored.` });
      return false;
    });
    return ok;
  };

  // Corroborations first: merged ids fold into their keep finding before culls run.
  const corroborations = [];
  for (const entry of asArray(raw.corroborations)) {
    const keepId = byId.has(entry.keep_id) ? entry.keep_id : null;
    if (!keepId) {
      warnings.push({ type: 'unknown_finding_id', detail: `Corroboration keep_id ${JSON.stringify(entry.keep_id)} is not a known finding id — entry dropped.` });
      continue;
    }
    const mergedIds = validIds(entry.merged_ids, 'Corroboration').filter((id) => {
      if (id === keepId) {
        warnings.push({ type: 'self_merge', detail: `Corroboration for ${keepId} listed itself in merged_ids — ignored.` });
        return false;
      }
      if (removed.has(id)) {
        warnings.push({ type: 'already_removed', detail: `Corroboration for ${keepId} listed ${id}, already merged/culled — ignored.` });
        return false;
      }
      return true;
    });
    if (!mergedIds.length) continue;

    const keep = byId.get(keepId);
    keep.corroborated_by = [
      ...(keep.corroborated_by || []),
      ...mergedIds.map((id) => {
        const m = byId.get(id);
        return { id, brand: m.brand, sheet_reference: m.sheet_reference, citation: m.citation, description: m.description };
      }),
    ];
    if (entry.note) keep.corroboration_note = entry.note;
    for (const id of mergedIds) removed.add(id);
    corroborations.push({ keep_id: keepId, merged_ids: mergedIds, note: entry.note || null });
  }

  const culled = [];
  for (const entry of asArray(raw.culls)) {
    const [id] = validIds([entry.finding_id], 'Cull');
    if (!id) continue;
    if (removed.has(id)) {
      warnings.push({ type: 'already_removed', detail: `Cull for ${id} — already merged/culled, ignored.` });
      continue;
    }
    removed.add(id);
    culled.push({ finding: byId.get(id), reason: entry.reason || 'No reason given.' });
  }

  const escalations = [];
  for (const entry of asArray(raw.escalations)) {
    const [id] = validIds([entry.finding_id], 'Escalation');
    if (!id) continue;
    const f = byId.get(id);
    if (f.evidence_type !== 'ABSENCE') {
      warnings.push({ type: 'non_absence_escalation', detail: `Escalation for ${id} — evidence_type is ${JSON.stringify(f.evidence_type)}, not ABSENCE. Entry dropped; only absence findings escalate.` });
      continue;
    }
    if (!removed.has(id)) f.escalated = true;
    escalations.push({ finding_id: id, finding: f, missing_sheet_types: asArray(entry.missing_sheet_types), rationale: entry.rationale || '' });
  }

  const contradictions = [];
  for (const entry of asArray(raw.contradictions)) {
    const findingIds = validIds(entry.finding_ids, 'Contradiction');
    if (!findingIds.length) {
      warnings.push({ type: 'empty_contradiction', detail: 'Contradiction entry cited no known finding ids — dropped.' });
      continue;
    }
    contradictions.push({
      finding_ids: findingIds,
      sheets: [...new Set(asArray(entry.sheets).map(String))],
      description: entry.description || '',
      citation: entry.citation || '',
    });
  }

  const derivedValueFlags = [];
  for (const entry of asArray(raw.derived_value_flags)) {
    const [id] = validIds([entry.finding_id], 'Derived-value flag');
    if (!id) continue;
    const f = byId.get(id);
    f.derived_value_flag = { value: entry.value || '', reason: entry.reason || '' };
    derivedValueFlags.push({ finding_id: id, value: entry.value || '', reason: entry.reason || '' });
  }

  // RFI drafts (Phase 4). The source finding id is validated like every other reference; the
  // RFI's brand and evidence_type come from the real finding, never from the model. RFIs against
  // culled findings are dropped (a filler finding's RFI is filler too); RFIs against merged-away
  // findings are dropped with a warning since the prompt directs them at the keep_id finding.
  const rfis = [];
  for (const entry of asArray(raw.rfis)) {
    const [id] = validIds([entry.source_finding_id], 'RFI');
    if (!id) continue;
    if (removed.has(id)) {
      warnings.push({ type: 'rfi_source_removed', detail: `RFI drafted against ${id}, which was merged/culled — dropped; RFIs must target surviving findings.` });
      continue;
    }
    const f = byId.get(id);
    if (f.finding_type === 'rfi') {
      warnings.push({ type: 'rfi_duplicate', detail: `RFI drafted against ${id}, which is already a specialist-drafted RFI finding — dropped as a duplicate.` });
      continue;
    }
    rfis.push({
      source_finding_id: id,
      brand: f.brand,
      rfi_subject: entry.rfi_subject || '',
      references: asArray(entry.references).map(String),
      question: entry.question || '',
      bid_impact: entry.bid_impact || '',
      bid_gating: entry.bid_gating === true,
      evidence_type: f.evidence_type,
      source_citation: f.citation,
    });
  }

  const adjusted = findings.filter((f) => !removed.has(f.id));
  return { adjusted, reconciliation: { contradictions, corroborations, escalations, culled, derivedValueFlags, rfis, warnings } };
}

// findings: deduped, brand-tagged specialist findings (post dedupeFindings — this call catches
//   what exact-string dedupe can't).
// sheetInventory: [{ sheetNumber, title?, discipline? }] — the full extracted set. For direct
//   runProjectSynthesis calls (hand-typed test sets) title/discipline may be null.
// gapCheck: { gaps } from findMissingCrossReferences, or null when the caller has none
//   (direct synthesis calls without the PDF pipeline).
// multiProductSheets: routeSheets' multi-brand sheet list.
// requiredConditions: brand-tagged required_conditions rows the specialists actually used.
//
// Returns { findings, reconciliation, usage } — findings with merges/culls applied and
// escalation/derived-value annotations attached; every removal is recorded in reconciliation.
export async function reconcileFindings({ findings, sheetInventory = [], gapCheck = null, multiProductSheets = [], requiredConditions = [] }) {
  // Stable ids the model must use to reference findings — assigned here, kept on the output
  // findings so reconciliation entries stay traceable to the findings they touched.
  const identified = findings.map((f, i) => ({ ...f, id: `F${i + 1}` }));

  if (!identified.length) {
    return {
      findings: identified,
      reconciliation: { contradictions: [], corroborations: [], escalations: [], culled: [], derivedValueFlags: [], rfis: [], warnings: [] },
      usage: null,
    };
  }

  const userContent = `FINDINGS:\n${JSON.stringify(
    identified.map(({ id, brand, finding_type, description, citation, sheet_reference, evidence_type, consequence }) => ({
      id, brand, finding_type, description, citation, sheet_reference, evidence_type,
      ...(consequence ? { consequence } : {}),
    })),
    null,
    2
  )}\n\nSHEET INVENTORY (the complete extracted set):\n${JSON.stringify(
    sheetInventory.map((s) => ({ sheetNumber: s.sheetNumber, title: s.title ?? null, discipline: s.discipline ?? null })),
    null,
    2
  )}\n\nGAP CHECK (sheets referenced by the set but absent from it):\n${
    gapCheck ? JSON.stringify(gapCheck.gaps || [], null, 2) : 'Not available for this run.'
  }\n\nMULTI-PRODUCT SHEETS:\n${JSON.stringify(multiProductSheets, null, 2)}\n\nREQUIRED CONDITIONS (brand-tagged, with where_expected):\n${JSON.stringify(
    requiredConditions,
    null,
    2
  )}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { result: raw, usage } = await callAndParseJson(anthropic, {
    model: MODEL,
    maxTokens: 8192,
    system: SYSTEM_PROMPT,
    userContent,
  });

  const { adjusted, reconciliation } = applyReconciliation(identified, raw);
  for (const w of reconciliation.warnings) console.error(`Reconciler guard [${w.type}]: ${w.detail}`);
  return { findings: adjusted, reconciliation, usage };
}
