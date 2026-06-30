# PM Intelligence Agent System — Final Architecture & Go-Ahead Plan

**Status:** Locked. This document supersedes the earlier draft build plan and the original Architectural AI Agent Operations Guidebook. It is the single reference for implementation.

**Context:** Solo-use tool, built and used by one PM. Hosted as a custom site — not a Claude Project workflow, not Cowork. GitHub (free) for source control, Vercel (Pro) for hosting.

---

## 1. What This System Does

Reads a PM-curated set of construction drawings for one project and produces a single unified report organized by project phase — estimating flags, critical path/lag, risk register, preconstruction checklist, measure day checklist, installation briefing for subs — followed by a brand-segmented appendix. Every claim is cited back to a sheet number and detail/gridline. This is a judgment tool, not a tracking system; project tracking stays in your existing tools.

---

## 2. Final Technology Stack

| Layer | Decision | Status |
|---|---|---|
| Reasoning | Claude API | Default to Sonnet for routine runs; Opus optional for synthesis if output quality needs it |
| Structured parameter store | Cloudflare D1 | Locked |
| Project knowledge / relational store | Cloudflare D1 (same account, separate table set or separate database) | Locked |
| Vector store | Cloudflare Vectorize | Locked |
| Hosting | Vercel (Pro) | Locked |
| Source control | GitHub (free) | Locked |
| PlanetScale | Connected, not used in v1 | Reserve only — see note below |
| Neon | Not connected | Documented fallback via direct API only, not part of v1 |
| Zapier | Connected, not required for v1 | Optional future automation trigger |

**Why Cloudflare carries both the relational and vector load:** D1 and Vectorize sit under one account, one free tier, one MCP connector. This replaces what was originally sketched as two separate paid services (Supabase + Pinecone) with one vendor. At this project's actual scale — project metadata, a parameter table with a few hundred rows, five brands' worth of spec documents — neither D1 nor Vectorize is anywhere near a scale where you'd need something heavier.

**On PlanetScale:** it's connected and costs nothing to leave idle, but running a second relational database alongside D1 for no specific reason adds complexity without a clear benefit. Recommendation: don't use it in v1. Keep it connected in case a future need (e.g., a separate analytics workload) justifies it.

**On Neon:** strong product, no MCP connector available, would require direct API integration in your backend code rather than a connector call. Not part of the v1 stack since D1/Vectorize already cover the need. Documented here only so the option isn't lost if D1 ever proves limiting.

---

## 3. Application Architecture

**Frontend:** A simple interface — upload the curated sheet set for a project, trigger a run, view the six-section report with the brand appendix below it. No multi-user features, no auth complexity beyond a basic gate (a password or env-var-based check is sufficient for solo use — this still needs to exist so the site isn't a public open endpoint burning your Claude API budget).

**Backend:** Vercel serverless functions. The functions call the Claude API directly (no separate Cloudflare Workers deployment needed — Workers would be a second hosting environment for no real benefit here; calling D1 and Vectorize via Cloudflare's REST API from Vercel functions is simpler and keeps everything in one deployed site). Drawing sheets are sent to Claude as native PDF input — Claude reads PDFs directly, so no separate OCR pipeline is needed, which simplifies what the original guidebook assumed was a required component.

**Orchestration flow per run:**
1. Routing step — classify curated sheets by brand, flag multi-product sheets.
2. Five brand specialist steps — each queries D1 for exact parameter values and Vectorize for semantic/failure-pattern matches against its own brand's sheets only.
3. Synthesis step — collects all specialist findings, organizes into the six output sections, writes the unified report plus appendix, attaches citations throughout.
4. Result is stored in D1 (for your own historical record) and rendered to the frontend.

---

## 4. Data Layer Detail

### 4.1 Cloudflare D1 — Structured Parameter Store

One table, normalized, versioned. Every exact number that can appear in output comes from here — never from Vectorize, never synthesized.

| Field | Type | Example |
|---|---|---|
| model_id | text | 933E |
| brand | text | Modernfold |
| parameter_name | text | stack_depth_formula |
| value | text | (panel_count × 3.75) + 10 |
| unit | text | inches |
| source_doc | text | Modernfold 933E Spec Sheet rev. 2024-03 |
| last_verified | date | 2024-03-15 |

### 4.2 Cloudflare D1 — Project Knowledge Store

Relational tables: `projects`, `drawing_sheets` (sheet_number, revision, date, brand_relevance), `findings` (sheet_id, brand, finding_type, description, cited_location), `parameters_used` (finding_id, parameter_row_id), `synthesis_reports`. This is what makes every claim in a report traceable back to a sheet.

### 4.3 Cloudflare Vectorize — Semantic Store

**Decision: five separate Vectorize indexes, one per brand**, rather than one shared index with namespace or metadata filtering. This is the simplest possible guarantee of brand isolation — there's no filter logic to get wrong, no risk of a Skyfold query accidentally pulling a Modernfold chunk because a metadata tag was mishandled. Each index holds that brand's manufacturer spec sheets, installation guides, known failure-pattern writeups, and relevant reference standards (e.g., ASTM E557 for Modernfold).

---

## 5. Brand Specialist Agents (Final)

Each agent's reasoning is bounded strictly to its product line — never mixes tolerances, tracking systems, or formulas across brands, even when systems appear on the same sheet.

**Skyfold** — grounds on structural headers, plenum clearance, electrical (3-phase 208V/480V), zero-deflection tolerance. Watches for undersized overhead steel relative to span, plenum obstructions along the panel travel path, voltage mismatches.

**Modernfold** — grounds on suspension systems (#14/#17/#30/RT100/RT200), STC ratings, stacking pocket geometry, seal configuration. Watches for pocket dimensions that don't match the stack-depth formula for the selected model, electrical devices inside the stacking footprint, floor flatness affecting bottom seals.

**Euro-Wall** — grounds on header rigidity (L/720), sill/trench profile (interior flush vs. exterior water-rated), wind-load rating, glass supply sync. Watches for subfloor recess depth that doesn't account for finished floor height, header framing that won't meet deflection limits under glass weight, missing drainage detail at exterior sills.

**Airolite** — grounds on free-area/CFM geometry, anchor schedules by substrate type, wind-load anchoring up to 150 PSF, structural tube requirement above 96.5" opening height. Watches for opening heights crossing the tube threshold with no tube detailed, substrate mismatched to anchor schedule, blade style changes that starve HVAC CFM.

**Smoke Guard** — grounds on FACP relay integration, gravity fail-safe mechanics, dedicated 120V backup circuit, header/wall-face clearance. Watches for obstructions in the curtain's travel path, missing or unverified FACP loop documentation, AHJ-specific timing variances not reflected in generic spec.

---

## 6. The Six Outputs (Final Format)

**Estimating Flags** — conditions that erode margin, with consequence and bid-protection move attached.
**Critical Path & Lag** — dependency chains anchored to your actual lead-time logic (fabrication starts at shop drawing approval + field certification, not contract signature).
**Risk Register** — trigger condition, consequence if uncaught, cheapest point in the timeline to catch it.
**Preconstruction Checklist** — sheet-specific items for the GC/sub meeting, referencing actual sheets and gridlines.
**Measure Day Checklist** — calculated pass/fail values specific to this opening, with what to photograph as evidence.
**Installation Briefing for Subs** — sequence, known failure modes, explicit holdpoints before irreversible steps.

Every line across all six carries a citation: sheet number, revision, detail/gridline reference.

---

## 7. Human-in-the-Loop Checkpoints (Unchanged)

Regardless of hosting decisions, these remain non-negotiable before anything proceeds toward fabrication release:

- Structural backing sanity check (load-bearing vs. non-structural line confusion)
- Stack/pocket depth formula confirmed against the specific model variant selected
- Field power drop confirmed with the electrical foreman against actual jobsite condition, not a database default
- AHJ-specific code variances confirmed for Smoke Guard timing
- Drawing revision currency confirmed — flag if any cited sheet isn't the latest revision on file

---

## 8. Soundness Check

This is the part you specifically asked me to do honestly before calling the plan ready. A few things are real and worth naming before you start building, none of them are blockers, but two of them are bigger than the engineering work itself.

**The parameter data entry is the actual bottleneck, not the code.** Building the D1 schema and the agent logic is the easy part. Manually extracting every exact tolerance, formula, and rated value from manufacturer spec sheets into structured rows — and getting it right — is real, ongoing work, and it's the single thing the whole system's accuracy depends on. The Master Playbook document already in your project has the field compliance matrix, which is a strong starting source for this, but it doesn't cover every model variant's formula (the 931 vs. 933E vs. 912 distinctions, for instance, need their own rows). Budget real time for this before expecting useful output.

**Vectorize ingestion needs source material gathered first.** The manufacturer technical data sheets, installation guides, and reference standards (ASTM E557, etc.) need to actually be on hand as files before anything gets ingested. If you don't already have these collected per brand, that's a prerequisite step, not something the system does for you.

**Vectorize index-per-brand should be verified at build time.** I'm recommending five separate indexes for clean isolation; confirm Cloudflare's current Vectorize feature set and limits when you're actually building, since platform capabilities shift and I can't verify real-time specifics from here.

**Vercel function duration limits matter for this workload.** A run that does five specialist passes plus synthesis, each calling the Claude API and querying D1/Vectorize, could run long. Confirm your Pro plan's function duration settings and configure accordingly rather than discovering a timeout mid-run.

**Multi-product sheet cross-checking is a real design detail, not solved by this document.** When a sheet flags as relevant to two brands (a Skyfold header and Airolite louvers on the same RCP, for instance), the synthesis step needs explicit logic to reconcile both specialists' findings against each other rather than treating them as independent. Worth a deliberate pass when you build the synthesis prompt.

None of this changes the architecture. It changes what you should expect to spend time on: less time on infrastructure than you might think, more time on data entry and source gathering than you might expect.

---

## 9. Build Sequence — Concrete Phases

Each phase is its own Claude Code session or a clean continuation of one. Shippable independently.

1. **Infrastructure skeleton.** GitHub repo, Vercel project, Cloudflare D1 database(s) provisioned with the schema above, five Vectorize indexes created, basic auth gate on the site. No agent logic yet — just the scaffolding running end to end with placeholder data.
2. **Populate the D1 parameter table.** The data-entry-heavy phase. Source from the Master Playbook document and manufacturer spec sheets, brand by brand.
3. **Ingest Vectorize indexes.** Requires source documents gathered per brand first.
4. **Build one brand specialist end-to-end.** Recommend Modernfold or Airolite — narrowest, well-defined failure modes. Validate the full chain: PDF intake → D1 lookup → Vectorize check → structured finding with citation, before replicating the pattern.
5. **Build the remaining four specialists** — faster once the pattern from step 4 is proven.
6. **Build the routing agent and synthesis agent** — the actual deliverable logic. This is where the most iteration time should go, since it's what you read.
7. **Frontend** — upload interface, report display, deploy.
8. **Test against one full real project** before relying on output for an actual bid.

---

## 10. Immediate Next Step

Open a Claude Code session and start at Phase 1. Bring this document and the Master Playbook document along as context for that session.
