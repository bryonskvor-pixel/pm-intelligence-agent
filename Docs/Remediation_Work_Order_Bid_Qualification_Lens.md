# Remediation Work Order — Bid Qualification Lens

**Status:** Authoritative execution plan. Supersedes nothing; extends the Final Architecture and Go-Ahead Plan.
**Written against:** repo head `018f341` ("Give specialists the actual drawing page…").
**Execution rule:** One phase per Claude Code session. Do not start a phase until the previous phase's acceptance checks pass. Commit at the end of each phase with the phase number in the commit message.

---

## Governing premise (read before touching code)

The five specialty products (Skyfold, Modernfold, Euro-Wall, Airolite, Smoke Guard) are never quantity problems — one to three units per job. The tool's entire value is **coordination**: noticing that required information either exists on some sheet or is conspicuously missing from every sheet. Canonical failure modes the tool exists to catch:

- Skyfold structural support / deflection criteria missing from the structural drawings entirely.
- Modernfold track structure and floor flatness assumed but never shown.
- Smoke Guard fire alarm sequencing spread across three disciplines' sheets, never reconciled.
- Airolite airflow requirements buried on M sheets nobody routed to the louver scope.
- Euro-Wall pocket framing and sill details value-engineered out between drawing sets.

Two hard rules flow from this and apply to every phase:

1. **Specialists never output a computed, inferred, or estimated quantity or dimension.** They may cite values transcribed from a sheet or retrieved from D1 (those are ground truth), and they may flag that a drawn value conflicts with a D1 formula/parameter — but the flag is phrased as a discrepancy plus an RFI, never as "the pocket needs to be X in." The moment this tool emits its own number it competes with takeoff software and loses.
2. **The highest-value finding class is absence and contradiction**, not extraction. Design every prompt and data structure to make "this required condition appears nowhere in the set" and "sheet A contradicts sheet B" first-class outputs.

---

## Phase 1 — Routing: specialists read the full set

**Problem:** `routeSheets()` in `src/synthesis/report.js` assigns a sheet to a brand only when `detect(sheet.text)` finds a model-ID keyword on that sheet. Triage's per-brand candidate lists (which correctly include structural sheets for Skyfold, M sheets for Airolite, fire-alarm sheets for Smoke Guard) are used only to select extraction pages in `src/pipeline/runFromPdf.js`, then discarded. Net effect: a structural sheet that never says "ZENITH" is extracted, lands in `unclassified`, and no specialist ever reads it. The Skyfold killer is architecturally invisible.

**Changes:**

1. Routing decides **which specialists fire**, not which sheets each specialist sees. A specialist fires if (a) any sheet keyword-matches its models, OR (b) triage listed candidate sheets for that brand. Both signals, OR'd — triage's judgment must survive into routing.
2. Every specialist that fires receives **all extracted sheets**, each tagged `role: "primary"` (keyword match or triage candidate for that brand) or `role: "context"` (everything else). Extend `normalizeSheets`/`formatSheetsBlock` in `src/lib/sheets.js` to carry and render the role in the sheet header marker.
3. Update every specialist system prompt: primary sheets are where your product lives; context sheets are where your product's requirements hide (structural, mechanical, electrical, fire alarm). Explicitly instruct: findings grounded on context sheets are expected and often the most valuable.
4. PDF attachment budget (`buildDrawingInputBlocks`, 20MB cap): attach primary-sheet PDFs first, then context sheets until budget exhausted. Context sheets degrade to text-only before primary sheets ever do.
5. Fix detection fragility while in the file: Skyfold's detector cannot match a sheet that says "Skyfold" with no model series — add brand-name detection. Modernfold's bare `'931'` substring will false-positive on detail numbers, room numbers, and dates — require a word-boundary or brand-context match.
6. `threadPipeline`: `runFromPdf.js` must pass the triage result into synthesis so signal (b) in item 1 is available. Currently it is not passed at all.

**Cost note:** at 1–3 units per job and a triaged subset of sheets, full-set-per-specialist token cost is trivial. Do not optimize this.

**Acceptance:** a test set containing one Skyfold-keyword sheet plus one structural sheet with no brand keywords must deliver both sheets to the Skyfold specialist, with the structural sheet tagged context. `npm run test:*` scripts updated to cover this.

---

## Phase 2 — Required-conditions library, two-track findings, evidence typing, quantity prohibition

All four are contract changes to the same five specialist files plus D1. Do them together.

### 2a. Required-conditions table (D1)

New table in `pm-intel-params`:

```sql
CREATE TABLE required_conditions (
  id INTEGER PRIMARY KEY,
  brand TEXT NOT NULL,
  model_id TEXT NOT NULL,          -- or BRAND-GENERAL
  condition TEXT NOT NULL,          -- what the drawings must show for this product to be biddable
  where_expected TEXT NOT NULL,     -- discipline/sheet types it should appear on
  absence_consequence TEXT NOT NULL,-- what happens at bid/install if it's missing
  source_doc TEXT NOT NULL
);
```

Seed per brand from the Master Playbook and the scar knowledge already embedded in the specialist prompts. Minimum seed set (expand from Playbook):

- **Skyfold:** overhead structural support sized for the concentrated dead load (load present whether wall is up or down); deflection criteria stated; plenum clearance along full travel path; 3-phase power circuit shown on E sheets.
- **Modernfold:** track support structure detailed; stacking pocket dimensioned; floor flatness tolerance stated somewhere (spec or notes); electrical clear of the stacking footprint.
- **Smoke Guard:** FACP auxiliary contact / interface documented on FA sheets; deploy-delay timing confirmed against AHJ requirement (order-time-only setting); dedicated circuit shown; curtain travel path clear on RCP.
- **Airolite:** airflow/CFM requirement stated on M sheets and reconciled to the scheduled louver model's free area; water penetration requirement vs. model rating; opening sizes vs. max single-section with mullion plan; substrate/fastener compatibility.
- **Euro-Wall:** pocket framing detailed; sill detail present including drainage at exterior; finished-floor relationship dimensioned; header deflection limit stated; DP requirement checked against the DP chart at actual opening size, not the brochure headline.

### 2b. Two-track finding rule (all five prompts)

Replace the current "if the input doesn't contain enough information to ground a finding, do not invent one" clause. That clause is correct for positive findings and fatal for absence findings. New contract:

- **Track 1 — positive findings:** must be grounded in evidence present in the input (text or graphics). Never invented. (Unchanged behavior.)
- **Track 2 — absence findings:** grounded in a `required_conditions` row PLUS confirmation the condition appears on no sheet in the input — primary or context. Citation cites the required-condition row and states "not found on any provided sheet." Absence findings are only valid when the specialist received the full sheet set (Phase 1 guarantees this); the prompt must say so.

Query `required_conditions` alongside `parameters` in each specialist's D1 lookup and inject as a labeled block: `REQUIRED CONDITIONS — verify each appears somewhere in the drawing input; flag every one that does not.`

### 2c. Evidence typing (all five prompts + finding schema)

Every finding gains a mandatory `evidence_type`: `TEXT_READ`, `SCHEDULE_EXTRACTED`, `SYMBOL_INTERPRETED`, `GEOMETRY_INFERRED`, `CROSS_REFERENCE`, `ABSENCE`. Hard rule in the prompt and enforced in a post-parse guard (extend the `callAndParseJson` path or add a findings guard module): any finding whose `evidence_type` is `GEOMETRY_INFERRED` is automatically demoted to a field-verification item and may never state a measurement value.

### 2d. Quantity prohibition (all five prompts)

Add verbatim-strength language: *"Never output a quantity, count, dimension, or measurement that you computed, inferred, estimated, or read from drawing geometry. You may quote a value exactly as written on a sheet or exactly as stored in D1. If a drawn value conflicts with a D1 parameter or formula, state the discrepancy and phrase the resolution as an RFI or field-verify item — do not state what the correct value 'should be.'"*

Rewrite the Modernfold "pocket dimensions that don't match the stack-depth formula" watch item to conform: flag the discrepancy, cite both values verbatim, output an RFI.

**Acceptance:** run the existing test drawing set. Every finding carries a valid `evidence_type`; at least one seeded required-condition absence is caught when its sheet is withheld from the input; zero findings contain a computed dimension (manual review of output).

---

## Phase 3 — Reconciliation agent

New module `src/synthesis/reconcile.js`, called by `runProjectSynthesis` after the specialists complete and before sectioning. One LLM call (Sonnet). Input: all five specialists' findings, the full sheet inventory (numbers, titles, disciplines), the gapCheck results, and the multi-product sheet list. Output, structured JSON:

1. **Contradictions:** findings or sheet contents that conflict across brands or across sheets (the Skyfold-header-and-Airolite-louver-on-one-RCP case from the architecture doc; also same-brand contradictions across sheets, e.g. a schedule vs. a plan disagreeing).
2. **Corroborations:** two specialists independently flagging the same underlying condition — merge into one strengthened finding rather than letting dedupe's exact-string match miss them (current `dedupeFindings` only catches identical text).
3. **Escalations:** absence findings whose `where_expected` sheet types are also missing from the extracted set entirely (absence of the sheet, not just absence on the sheet) — these become top-severity Unresolved Items.
4. **Generic-filler cull:** the reconciler is explicitly instructed to drop or demote any finding a general-purpose model would produce without product-specific knowledge ("coordinate with GC," "verify dimensions in field" with no product-specific trigger). Defensibility is enforced here, at one chokepoint, rather than policed in five prompts.

The reconciler **never invents findings** — it only relates, merges, escalates, and culls what the specialists produced plus what the mechanical gap check found. Same JSON-only, cite-everything discipline as the specialists.

**Acceptance:** a test set engineered with one deliberate cross-sheet contradiction produces a contradiction entry citing both sheets; a duplicated finding phrased two ways by two specialists merges; a "coordinate with GC" filler finding is culled.

---

## Phase 4 — Report reshape: bid qualification package

Restructure `REPORT_SECTIONS` in `src/synthesis/report.js` and `src/render/renderMarkdown.js`. New PM-facing structure, in this order:

1. **What the Drawings Don't Show** — all `ABSENCE` findings plus reconciler escalations.
2. **RFI List (before pricing)** — every discrepancy/absence rendered as a **ready-to-issue RFI draft**, not a bullet the estimator rewrites. New `finding_type: "rfi"` permitted from specialists and generated by the reconciler from discrepancy and absence findings. Each RFI carries a structured shape enforced in the finding schema and rendered by `renderMarkdown.js`:
   - `rfi_subject` — one-line subject as it would appear on the RFI form.
   - `references` — the specific sheets/details/schedule cells in question, verbatim sheet numbers.
   - `question` — the precise question to the architect/engineer. Must be answerable; "please clarify" alone is not a question. Quantity prohibition applies: the RFI asks what the value/condition is, it never proposes what it should be.
   - `bid_impact` — what cannot be priced, or must be qualified/excluded, until this is answered. This field is what lets a sales lead sort gating RFIs from housekeeping.
   - `evidence_type` — inherited from the underlying finding (`ABSENCE`, `CROSS_REFERENCE`, etc.).
   The renderer numbers RFIs sequentially (RFI-01, RFI-02…) so the package can go out as-is, and orders them with bid-gating items (per `bid_impact`) first.
3. **Proposal Qualifications** — qualification language for the bid ("Proposal assumes structural support for Skyfold unit by others per…"). New `finding_type: "qualification"`.
4. **Field Verification List** — the current measure-day checklist plus all demoted `GEOMETRY_INFERRED` items.
5. **Risk Register** — current risk findings plus contradictions from the reconciler.
6. **Unresolved Items** — **required section, may not be omitted even when empty** (render "None — all required conditions accounted for" so its absence from a report is itself a signal). Contains: gapCheck's referenced-but-missing sheets (promoted from the QA appendix — an estimator must see "S-501 is referenced for steel and is not in this set" on page one, not in diagnostics), unresolved triage candidates, ordering mismatches that survived, and reconciler escalations.
7. **Brand Appendix** — unchanged, plus per-finding `evidence_type` displayed.

Preconstruction checklist and installation briefing remain as appendix sections — they're install-phase value, not bid-time, and must not crowd the qualification package. Cross-Brand Watch content folds into Risk Register via the reconciler.

**Acceptance:** rendered markdown from the standard test set opens with sections 1–6 in order; gapCheck gaps appear in Unresolved Items, not only in diagnostics.

---

## Phase 5 — PM confirmation gate

After triage and before candidate-page extraction in `runFromPdf.js`: emit the routing manifest (per-brand candidate sheets, unresolved candidates, page mapping) and stop. Pipeline resumes only on explicit confirmation. Implementation for the current CLI/test context: split `runPipelineFromPdf` into `planPipeline(pdfBytes)` → manifest, and `executePipeline(pdfBytes, confirmedManifest)`. The PM may edit the manifest (add/remove candidate sheets) before confirming — the human curation step is a feature, not friction. The Vercel one-agent-per-call architecture already stores intermediate state in D1, so this split maps cleanly onto it later.

**Acceptance:** pipeline cannot reach extraction of candidate pages without a confirmed manifest object; edited manifests are honored.

---

## Standing constraints for every session

- Test after every phase with the existing `test:*` scripts plus new cases named in acceptance checks.
- No new paid services. Cloudflare D1/Vectorize, Anthropic API, Vercel only.
- Update `SESSION_NOTES.md` at the end of each session with what shipped and what's next.
- If a phase reveals a conflict with this document, stop and flag it — do not improvise architecture mid-session.
