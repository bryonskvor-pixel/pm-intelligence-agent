# Cloudflare Resources

Provisioned resources for this project. Update this file whenever resources are added/changed.

## D1 Databases

| Name | UUID | Purpose |
|---|---|---|
| pm-intel-params | `18812c7c-0661-4e87-beaa-926b18f13a67` | Structured parameter store — exact tolerances/formulas per brand/model |
| pm-intel-knowledge | `305c2b6e-3c25-4ac1-b9f6-39ad23422c8d` | Project knowledge / relational store — projects, sheets, findings, reports |

### pm-intel-params schema

```sql
CREATE TABLE parameters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  parameter_name TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT,
  source_doc TEXT NOT NULL,
  last_verified TEXT NOT NULL
);
CREATE INDEX idx_parameters_brand_model ON parameters(brand, model_id);
CREATE INDEX idx_parameters_name ON parameters(parameter_name);
```

### pm-intel-knowledge schema

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT
);

CREATE TABLE drawing_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  sheet_number TEXT NOT NULL,
  revision TEXT,
  date TEXT,
  brand_relevance TEXT
);

CREATE TABLE findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id INTEGER NOT NULL REFERENCES drawing_sheets(id),
  brand TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  description TEXT NOT NULL,
  cited_location TEXT
);

CREATE TABLE parameters_used (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id INTEGER NOT NULL REFERENCES findings(id),
  parameter_row_id INTEGER NOT NULL
);

CREATE TABLE synthesis_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  report_json TEXT NOT NULL
);

CREATE INDEX idx_sheets_project ON drawing_sheets(project_id);
CREATE INDEX idx_findings_sheet ON findings(sheet_id);
CREATE INDEX idx_findings_brand ON findings(brand);
CREATE INDEX idx_params_used_finding ON parameters_used(finding_id);
CREATE INDEX idx_reports_project ON synthesis_reports(project_id);
```

## Vectorize Indexes

Five brand-isolated indexes created via `wrangler vectorize create`, 768 dimensions (Workers AI `bge-base-en-v1.5`), cosine metric, per architecture doc Section 4.3.

| Index name | Brand |
|---|---|
| pm-intel-skyfold | Skyfold |
| pm-intel-modernfold | Modernfold |
| pm-intel-euro-wall | Euro-Wall |
| pm-intel-airolite | Airolite |
| pm-intel-smoke-guard | Smoke Guard |

**Access note:** No MCP tools exist for Vectorize in this session's Cloudflare connector (only D1/KV/R2/Workers/Hyperdrive do). Vectorize is managed via `npx wrangler vectorize ...` instead, authenticated through a scoped API token stored locally in `.cloudflare.env` (gitignored, never committed). The token needs **two** permissions: `Account > Vectorize > Edit` (index management) and `Account > Workers AI > Read` (generating embeddings via the bge-base-en-v1.5 model). To run any wrangler Vectorize command:

```bash
cd ~/dev/pm-intelligence-agent && set -a && source .cloudflare.env && set +a && npx wrangler vectorize <command>
```

Account ID: `f6533d2f54eb09876d33ad2f11bcc60c`

## Ingestion Pipeline (proven working)

1. `WebFetch` the source PDF URL — inline text extraction usually fails (compressed PDF streams), but it saves the raw PDF to a local tool-results path.
2. `Read` that saved PDF path directly — extracts full clean text (this works reliably; WebFetch's own extraction does not).
3. Structured numeric/exact values (tolerances, dimensions, ratings) → `INSERT INTO parameters` in the relevant brand-scoped D1 rows.
4. Narrative/contextual content → chunk by section, write to a JSON file of `{id, model_id, section, text}` objects.
5. Embed chunks: a small Node script (`embed_chunks.js`, pattern saved in scratchpad during the session) calls the Workers AI REST endpoint `POST /accounts/{account_id}/ai/run/@cf/baai/bge-base-en-v1.5` with `{"text": [...]}`, batches all chunk texts in one call, writes an NDJSON file of `{id, values, metadata}`.
6. `npx wrangler vectorize insert <index-name> --file=<path>.ndjson` to load the vectors.
7. Verify with `npx wrangler vectorize query <index-name> --vector-id="<some-id>" --top-k=3` (avoid `--vector` with the full float array inline — the shell command line length limit gets exceeded; query by an existing vector's ID instead).

## Modernfold Ingestion Status (2026-06-30)

Source: 7 spec sheets pulled from modernfoldstyles.com (found via web search after the Deltek SpecPoint product database link the user provided returned no content — that site is JS-rendered and inaccessible to WebFetch).

| Document | Model(s) | D1 rows | Vectorize chunks |
|---|---|---|---|
| Acousti-Seal 933E Spec rev. 2016-05 | 933E | 16 | 3 |
| Acousti-Seal 931 Spec rev. 2016-05 | 931 | 13 | 2 |
| GWS Compactline Spec rev. 2010-09 | GWS-COMPACTLINE | 6 | 2 |
| GWS DRS Spec rev. 2010-09 | GWS-362SR/362TR/600SR/800SR/1000SR-DRS, GWS-DRS | 10 | 2 |
| Encore Single Panel Spec rev. 2016-05 | ENCORE-SINGLE | 8 | 2 |
| Encore Paired Panel Spec rev. 2016-05 | ENCORE-PAIRED | 6 | (shares ENCORE chunks above) |
| Soundmaster & Modernfold Accordion Spec rev. 2015-10 | SOUNDMASTER-8/12, MODERNFOLD-800/1200, ACCORDION | 9 | 2 |

Total: 68 D1 parameter rows, 14 Vectorize chunks, all in the Modernfold-only stores (`pm-intel-modernfold` index; `parameters` table filtered by `brand = 'Modernfold'`).

## Skyfold Ingestion Status (2026-06-30)

Source: 4 documents — CSI spec sheet (Classic series, via modernfoldstyles.com), Standard Deflection Criteria, Zenith Premium GC/electrical coordination notes, and full product comparison chart (all via skyfold.com). Same discovery pattern as Modernfold: the user's Deltek SpecPoint link didn't work for Skyfold either (not tried directly, went straight to manufacturer site + search).

| Source | Coverage | D1 rows | Vectorize chunks |
|---|---|---|---|
| Skyfold Classic Spec Sheet Section 10-22-39 rev. 2016-10 | Classic 51/55/60/NRC + brand-wide electrical/safety/warranty | ~35 | 3 |
| Skyfold Standard Deflection Criteria | Brand-wide deflection philosophy | 2 | 1 |
| Skyfold Zenith Premium GC Notes (drawing SKY-XXXX) | Brand-wide electrical, access panel, pocket depth | ~8 | 1 |
| Skyfold Product Line Comparison Summary | Zenith 48/51/55/60/NRC, Zenith Premium 51/55/60/NRC, Mirage | ~52 | 1 |

Total: 97 D1 parameter rows (brand-wide rows under `model_id = 'SKYFOLD-GENERAL'`, model-specific rows under e.g. `SKYFOLD-CLASSIC-60`, `SKYFOLD-ZENITH-PREMIUM-51`, `SKYFOLD-MIRAGE`), 6 Vectorize chunks in `pm-intel-skyfold`.

Both Modernfold and Skyfold also got a finishes pass after the fact (finishes were initially out of scope — added when the user asked whether the specialists knew about finishes): 16 D1 rows + 2 Vectorize chunks. Modernfold's finish rules turned out to be construction-type-dependent (933E/931 full range, Encore drops laminate/veneer, Accordion most restrictive, GWS glass has no fabric option), not brand-wide. Skyfold's came straight from skyfold.com/en-US/products/finishes (thickness/weight limits, NRC-models-need-fabric rule).

## Smoke Guard Ingestion Status (2026-07-01)

Source: 9 product-line tech sheets + 1 shared controller spec, all pulled directly from smokeguard.com/wp-content/uploads (found via smokeguard.com/documents-downloads, which — unlike the Modernfold/Skyfold sites — listed direct PDF URLs without needing a web search fallback). User confirmed full-catalog scope before this ran.

| Product line | D1 rows | Notes |
|---|---|---|
| M1000 (vertical, window, passive fusible-link) | 4 | No electrical — 165°F fusible link, manual retract |
| M2100 (vertical opening protective) | 7 | 120VAC, 7A circuit |
| M2500 (vertical fire+smoke, large) | 9 | 120/240VAC, 10A, Main+Satellite controllers over 20ft |
| M3000 (horizontal) | 10 | 120/240VAC, 10A (2 circuits for 4-motor systems) |
| M4000 (perimeter, no corner posts) | 9 | 120/240VAC, 20A per 60ft, curtain angle 30-150° |
| SG Draft (static, fixed) | 4 | No electrical |
| Hose Stream 2100 (dual curtain, 90-min hose stream rated) | 8 | 120/240VAC, 20/10A |
| M600 (elevator, custom) | 8 | Deploys ONLY on local elevator lobby detector, never general alarm |
| M200/M400 (elevator, standard) | 14 | M200 has NO battery backup option; M400 optional 8hr |
| SG Controller (shared by M2100/2500/3000/4000) | 11 | Deploy-delay timing settable ONLY at time of order — key AHJ-variance gotcha |

Total: 85 D1 parameter rows, 5 Vectorize chunks in `pm-intel-smoke-guard` (FACP integration/fail-safe pattern, the AHJ-timing gotcha, elevator activation-logic distinctions, obstruction/clearance checklist pattern, product line overview).

## Airolite Ingestion Status (2026-07-01)

Initial pass covered only the 4 performance (weather-rated) louver models. User flagged that the full catalog — grilles, screens, sun controls, finishes — was still missing, so a second ingestion pass added the rest of the product line from PDFs the user provided directly (grille/screen catalog, individual grille spec sheets, sun control spec sheets, sun control IOM, finishes/colors catalog, louver fundamentals guide).

| Category | Models | D1 rows | Vectorize chunks |
|---|---|---|---|
| Performance louvers (initial pass) | K8206, K6776, T6636, AC153, AIROLITE-GENERAL | 46 | 5 |
| Bar grilles | AFG100, ABG100, CBG100, LBG100, GIG100, SLG100 + AIROLITE-GRILLES-GENERAL | ~44 | (shared chunks below) |
| Geometric grilles | CGG100, MG100, PDG100, GSG100, TG100 | ~24 | — |
| Louver screens | ENCB609, ENCB6096, ENCB6500, SCB601, CV605, SV961, SV962 | ~42 | — |
| Sun controls | ASC4, ASC6, AIROLITE-SUN-CONTROLS-GENERAL | ~24 | — |
| Finishes (brand-wide) | AIROLITE-GENERAL | 12 | — |

Second-pass total: 150 D1 rows, 5 new Vectorize chunks (grilles-vs-louvers category distinction, grille structural/submittal requirements, sun-control anodize/multi-alloy risk, sun-control thermal-expansion installation note, finish warranty tiers). Combined Airolite total: 196 D1 rows, 10 Vectorize chunks in `pm-intel-airolite`.

Key finding from this pass: Airolite's own finishes literature documents that **anodize is not recommended for Sun Controls** because blades (alloy 6063-T5) and outriggers (alloy 6061-T6) are different aluminum alloys that anodize to visibly different shades — a real, manufacturer-flagged spec mismatch now baked into the specialist's reasoning.

Scripts used (kept in `scripts/`, reusable for future brand expansions): `ingest_airolite_expansion.js` (batched D1 inserts, batch size 10 — D1 REST hits a "too many SQL variables" error above ~15 rows x 7 columns per statement), `embed_and_insert.js` (generic chunk-JSON → Workers AI embed → NDJSON writer, usable for any brand/index going forward).

## Euro-Wall Ingestion Status (2026-07-01)

Source: 24 PDFs fetched directly from euro-wall.com's public resource pages (Profile Sheets, Install Instructions, Brochures — no user-provided files needed this time). User confirmed full-catalog scope before starting, per the Airolite lesson. Discovery: WebFetch cannot parse PDF content directly (returns raw binary/metadata), but it saves the file locally and the `Read` tool renders it correctly — for large PDFs (>10MB) WebFetch's own fetch fails with a content-length cap error, worked around via a `curl` download to a local path followed by `Read`. Extraction was delegated to 3 parallel background research agents (profile sheets / install instructions / brochures), each returning structured findings — a pattern worth reusing for future large document sets to keep the main session's context light.

7 product lines total: Vista DS (fixed/direct-set window), Vista Multi Slide (sliding door), Vista Fold C3 (impact-rated folding door) and C5 (thermally broken folding door), Vista Fold Multi-Directional (fold-and-slide configuration variant), Vista Pivot (impact-rated pivot door), Vista CT (casement window — brand's first operable window line), and Vista TL (thin-line fixed glass wall). CT and TL are newly launched lines with brochure-only specs (no profile sheets/install guides published yet).

| Product line | D1 model_id | D1 rows | Notes |
|---|---|---|---|
| Brand-wide | EUROWALL-GENERAL | 26 | Shared tolerances, warranty-voidance conditions, maintenance schedule, finish palette |
| Vista DS | EUROWALL-DS | 11 | FL46965; fixed/non-operable; 5 configuration variants incl. trapezoid (max 25° angle) |
| Vista Multi Slide | EUROWALL-MS | 15 | 2-5 track configs; weephole/embed sill logic |
| Vista Fold C3 (impact) | EUROWALL-FOLD-C3 | 19 | FL17838; only 3 of 4 sill options are HVHZ-rated (Channel Sill is not) |
| Vista Fold C5 (thermal) | EUROWALL-FOLD-C5 | 7 | FL27023 |
| Vista Fold Multi-Directional | EUROWALL-FOLD-MULTIDIRECTIONAL | 8 | Fold+slide double-egress variant; own panel-size table |
| Vista Pivot | EUROWALL-PIVOT | 15 | FL22410; hard flooring-before-install sequencing dependency |
| Vista CT (new line) | EUROWALL-CT | 13 | FL47078; first operable window; DP tapers above 96" height |
| Vista TL (new line) | EUROWALL-TL | 14 | FL47174; DP tapers above 84" height; single lites up to 16'-6" |

Total: 136 D1 parameter rows, 8 Vectorize chunks in `pm-intel-euro-wall` (Pivot flooring-sequencing dependency, Fold C3 channel-sill rating gap, Fold C3 sill-liner-before-inspection hold, Fold C3 panel/hinge sequencing, Multi Slide weephole/embed logic, brand-wide warranty-voidance conditions, Fold Multi-Directional mechanism distinction, CT/TL design-pressure tapering).

Key findings from this pass: (1) Vista Fold C3's Channel Sill (E0108) is explicitly Non-FPA — not impact rated — while the other 3 sill options are, making sill selection a real HVHZ-compliance risk on impact-rated projects; (2) Vista Pivot has a hard-documented flooring-before-door-install sequencing dependency with a temporary-substrate fallback; (3) Vista CT and Vista TL's headline design-pressure numbers (80/90 psf) only hold up to a height threshold (96"/84") and taper meaningfully above it — a common way a brochure's marketing number gets misapplied to an oversized opening.

Script used: `scripts/ingest_euro_wall.js` (reused the batched-insert pattern, batch size 10) + the existing generic `scripts/embed_and_insert.js`.

## Brand Specialist Agents

All five built and validated end-to-end (drawing text → D1 lookup → Vectorize semantic search → Claude synthesis → cited structured findings):
- `src/specialists/modernfold.js` / `test-modernfold.js` — run via `npm run test:modernfold`
- `src/specialists/skyfold.js` / `test-skyfold.js` — run via `npm run test:skyfold`
- `src/specialists/smoke-guard.js` / `test-smoke-guard.js` — run via `npm run test:smoke-guard`
- `src/specialists/airolite.js` / `test-airolite.js` — run via `npm run test:airolite`. Model detection spans 4 performance louvers + 11 grille types + 7 screen types + 2 sun control types, with category-general D1 rows (AIROLITE-GRILLES-GENERAL, AIROLITE-SUN-CONTROLS-GENERAL) auto-attached based on which specific models are detected in the drawing text.
- `src/specialists/euro-wall.js` / `test-euro-wall.js` — run via `npm run test:euro-wall`. Model detection uses a brand/name-alias table (drawing text says "Vista Fold C3", D1 rows use `EUROWALL-FOLD-C3`) rather than literal model_id string matching, since Euro-Wall's product names don't appear in the model_id format anywhere in real drawing text. Test scenario (Fold C3 with a Channel Sill on an HVHZ project + sill liner installed before inspection, Pivot door scheduled before finished flooring, oversized Vista TL citing the brochure's flat headline DP) correctly caught all three planted issues plus 11 supporting findings.

All five share the pattern in `src/lib/cloudflare.js` (D1/Vectorize/Workers AI REST client) and require `ANTHROPIC_API_KEY` in `.env.local` plus `.cloudflare.env` sourced.

**JSON robustness fix (applies to all five):** the specialists occasionally emitted invalid JSON when finding descriptions echoed inch-mark measurements (e.g. `14'-0"`) without escaping the embedded quote. Fixed with a system-prompt instruction to write `in.` instead of `"` for inches, plus a one-time automatic retry (`callAndParse` helper in each specialist file) if parsing still fails.

**All 5 target brands now have complete D1 + Vectorize ingestion and a validated specialist agent.** Remaining work is the routing/synthesis agent (architecture doc Section 5-6) that combines brand specialists into the unified 6-section report, plus Vercel/auth/frontend.
