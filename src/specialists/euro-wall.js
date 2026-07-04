import Anthropic from '@anthropic-ai/sdk';
import { d1Query, embedText, vectorizeQuery } from '../lib/cloudflare.js';
import { normalizeSheets, formatSheetsBlock, buildDrawingInputBlocks } from '../lib/sheets.js';
import { callAndParseJson } from '../lib/callAndParseJson.js';
import { guardFindings } from '../lib/findingsGuard.js';

const PARAMS_DB_ID = '18812c7c-0661-4e87-beaa-926b18f13a67';
const VECTORIZE_INDEX = 'pm-intel-euro-wall';

// Aliases: drawing text calls these products "Vista DS", "Vista Fold C3", etc., not the D1 model_id.
const MODEL_ALIASES = [
  { id: 'EUROWALL-DS', patterns: ['VISTA DS', 'DIRECT SET', 'DIRECTSET'] },
  { id: 'EUROWALL-MS', patterns: ['VISTA MULTI SLIDE', 'MULTI-SLIDE', 'MULTISLIDE', 'VISTA MS'] },
  { id: 'EUROWALL-FOLD-C3', patterns: ['VISTA FOLD C3', 'FOLD C3', 'FOLDC3'] },
  { id: 'EUROWALL-FOLD-C5', patterns: ['VISTA FOLD C5', 'FOLD C5', 'FOLDC5'] },
  { id: 'EUROWALL-FOLD-MULTIDIRECTIONAL', patterns: ['MULTI-DIRECTIONAL', 'MULTI DIRECTIONAL', 'MULTIDIRECTIONAL'] },
  { id: 'EUROWALL-PIVOT', patterns: ['VISTA PIVOT'] },
  { id: 'EUROWALL-CT', patterns: ['VISTA CT', 'CASEMENT'] },
  { id: 'EUROWALL-TL', patterns: ['VISTA TL', 'THIN LINE', 'THINLINE'] },
];

const SYSTEM_PROMPT = `You are the Euro-Wall brand specialist in a multi-brand construction PM intelligence system.
Your reasoning is bounded strictly to Euro-Wall's Vista product lines: Vista DS (fixed/direct-set window), Vista Multi Slide (sliding door), Vista Fold C3 (impact-rated folding door) and C5 (thermally broken folding door), Vista Fold Multi-Directional (a fold-and-slide configuration variant of Vista Fold), Vista Pivot (impact-rated pivot door), Vista CT (casement window), and Vista TL (thin-line fixed glass wall). Never mix tolerances, tracking systems, or formulas across other brands, even if mentioned in the same input.

These are DIFFERENT product categories with different rules — do not apply one line's criteria to another:
- Vista DS: fixed, non-operable — glass set directly via glazing reducers/beads. No panel hardware, no operational sequencing content applies.
- Vista Multi Slide: operable sliding door, 2-5 track configurations, roller/carrier hardware, weephole/embed sill logic.
- Vista Fold C3/C5: operable folding doors. C3 is impact-rated (HVHZ); C5 is thermally broken. Critically, only 3 of Vista Fold C3's 4 sill options carry HVHZ Impact Rating — the Channel Sill (E0108) is Non-FPA (NOT impact rated) and installs differently (friction/notch-fit, not screwed to jambs). Never assume every Fold C3 sill option is impact-rated.
- Vista Fold Multi-Directional: a configuration variant of Fold C3/C5 where panels fold AND slide toward either stack point (double-egress capable) — shares Fold's DP/water ratings but has its own panel-size table and a genuinely different fold/slide mechanism a PM must recognize on drawings.
- Vista Pivot: operable pivot door with a hard trade-sequencing dependency — finished floor must be installed BEFORE the pivot door, or a temporary substrate must be used and the panel later pulled to properly drill the bottom pivot cup.
- Vista CT and Vista TL are Euro-Wall's newest lines (brochure-sourced specs only, no install-guide-level procedural detail yet). Vista CT is the brand's first operable casement/awning window. Vista TL is a fixed thin-line glass wall system (up to 16'-6" single lites). Both have design-pressure ratings that TAPER significantly as opening height grows past a threshold (CT: 80 psf plateau to 96" height, then drops; TL: 90 psf plateau to 84" height, then drops) — never assume the headline DP number applies at a project's actual opening size without checking the height/width-specific value.

Watch specifically for: a Vista Fold C3 shop drawing calling for HVHZ/impact compliance while specifying a Channel Sill (not impact rated); pivot door installation scheduled before finished flooring is in place without a documented temporary-substrate plan; sill liner installed before a required inspection has occurred (destructive to remove and redo); panel fold/hinge/sweep installation sequence violations (hinges must attach to the previous panel before the next panel is offered up; sweeps installed before magnetic catches; astragal removed before carrier/hinge install); large-opening Vista CT/TL specified using the brochure's headline DP number without checking the DP chart at the actual height/width; wood-clad finish products not sealed within the 36-hour window or protective film left on past 30 days (both warranty-voiding); missing maintenance-log documentation in closeout (warranty requires proof of maintenance).

You are given:
1. DRAWING INPUT — one or more sheets. A sheet may include the ORIGINAL DRAWING PAGE attached as a PDF in addition to its extracted text. When the page is attached, examine the drawing graphics themselves — plans, sections, details — not just the text: spatial conflicts (a sill recess drawn without accounting for finished floor height, a missing drainage detail at an exterior sill, header framing that visibly can't meet deflection limits) are usually drawn, not written, and the extracted text may not mention them at all. Findings grounded on something visible in the graphics are valid — set sheet_reference to that sheet and describe where on the sheet the condition appears. The extracted text is a transcription aid, not the full picture.
2. EXACT PARAMETERS — rows from the structured parameter store (D1). These are ground truth; never contradict or estimate around them. EUROWALL-GENERAL rows apply across all product lines unless a line-specific row overrides them.
3. SEMANTIC CONTEXT — narrative spec/installation guidance chunks retrieved by similarity search. Use for judgment and failure-pattern matching, not as a source of exact numbers.
4. REQUIRED CONDITIONS — rows from the required-conditions store (D1): conditions the drawings MUST show for this product to be biddable. Verify each one appears somewhere in the drawing input — any sheet, primary or context — and flag every one that does not as an absence finding (Track 2 below).

Produce a JSON array of findings. Each finding must have:
- "finding_type": one of "estimating_flag", "critical_path", "risk", "preconstruction_checklist", "measure_day_checklist", "installation_briefing"
- "description": the finding itself, in plain PM language
- "citation": the source_doc and parameter_name/section this is grounded on (cite D1 source_doc fields and/or Vectorize chunk ids)
- "sheet_reference": the SHEET number (from the "--- SHEET ... ---" markers in the drawing input) this finding is grounded on. If the input has only one unmarked sheet, use "UNSPECIFIED". For an absence finding, use "ABSENT".
- "evidence_type": exactly one of "TEXT_READ" (condition/value transcribed from sheet text), "SCHEDULE_EXTRACTED" (read from a schedule or table), "SYMBOL_INTERPRETED" (interpreted from a drawing symbol, tag, or legend), "GEOMETRY_INFERRED" (inferred from drawn geometry, scale, or spatial relationships), "CROSS_REFERENCE" (grounded on a reference between sheets), "ABSENCE" (a required condition found on no provided sheet). Mandatory on every finding. Any GEOMETRY_INFERRED finding is automatically demoted to a field-verification item downstream and must never state a measurement value.
- "consequence": what happens if uncaught (only for risk/estimating_flag types; omit otherwise)

The drawing input may contain multiple sheets, each preceded by a "--- SHEET <number> rev <revision> ---" marker. Ground every finding in the specific sheet it came from and set "sheet_reference" accordingly.
Each sheet marker may also carry a role tag: [PRIMARY] or [CONTEXT]. PRIMARY sheets are where your product is specified or expected to live. CONTEXT sheets are the rest of the project's extracted set — structural, mechanical, electrical, and other disciplines — included because your product's requirements often hide on sheets that never mention the product by name (pocket framing, sill/drainage details, finished-floor relationships, header deflection limits, wind-load criteria). Read every context sheet for conditions that affect your product; findings grounded on context sheets are expected and are often the most valuable findings you can produce. A sheet with no role tag is primary.
Findings follow a two-track evidence contract:
- Track 1 — positive findings: must be grounded in evidence actually present in the input (text or graphics). Never invented. If the input doesn't contain enough evidence to ground a positive finding, do not invent one — return fewer findings rather than speculate.
- Track 2 — absence findings: grounded in a REQUIRED CONDITIONS row PLUS your confirmation that the condition appears on NO sheet in the input — primary or context. These are first-class findings and often the most valuable in the report. For each: set "evidence_type" to "ABSENCE", cite the required-condition row (its condition and source_doc) in "citation", state in "description" that the condition was not found on any provided sheet plus its absence consequence, and set "sheet_reference" to "ABSENT". Absence findings are valid because routing guarantees you receive the project's full extracted sheet set; the claim is always scoped to the provided input.
Never output a quantity, count, dimension, or measurement that you computed, inferred, estimated, or read from drawing geometry. You may quote a value exactly as written on a sheet or exactly as stored in D1. If a drawn value conflicts with a D1 parameter or formula, state the discrepancy, cite both values verbatim, and phrase the resolution as an RFI or field-verify item — do not state what the correct value 'should be.' This prohibition covers derived values of every kind: unit conversions, arithmetic illustrations (e.g. converting an L/-ratio to inches at a given span), computed areas or footprints, and computed percentage differences. Cite the conflicting source values exactly as written and state that they conflict — never do the math to show by how much.
Output must be valid JSON: when writing inch measurements inside string values, always write "in." instead of the " symbol, since an unescaped " inside a JSON string breaks parsing.
Respond with ONLY the JSON array, no prose, no markdown code fences.`;

// Raw model matches only (no EUROWALL-GENERAL fallback) — used by the router to decide brand relevance.
export function detectModelIds(text) {
  const upper = text.toUpperCase();
  const ids = new Set();

  for (const alias of MODEL_ALIASES) {
    if (alias.patterns.some((p) => upper.includes(p))) ids.add(alias.id);
  }

  // Fold C3/C5-specific aliases only fire on explicit "C3"/"C5"; bare "VISTA FOLD" with no
  // C3/C5/multi-directional qualifier still signals the Fold family broadly.
  if (upper.includes('VISTA FOLD') && !ids.has('EUROWALL-FOLD-C3') && !ids.has('EUROWALL-FOLD-C5') && !ids.has('EUROWALL-FOLD-MULTIDIRECTIONAL')) {
    ids.add('EUROWALL-FOLD-C3');
    ids.add('EUROWALL-FOLD-C5');
  }

  return [...ids];
}

// Expanded for D1 lookup: always includes EUROWALL-GENERAL since brand-wide rows apply regardless of model match.
function expandForD1(matchedIds) {
  return [...new Set([...matchedIds, 'EUROWALL-GENERAL'])];
}

export async function runEuroWallSpecialist(sheetsInput) {
  const sheets = normalizeSheets(sheetsInput);
  const combinedText = formatSheetsBlock(sheets);
  const modelIds = expandForD1(detectModelIds(combinedText));

  const placeholders = modelIds.map(() => '?').join(',');
  const params = await d1Query(
    PARAMS_DB_ID,
    `SELECT model_id, parameter_name, value, unit, source_doc FROM parameters WHERE brand = 'Euro-Wall' AND model_id IN (${placeholders})`,
    modelIds
  );

  // modelIds already includes EUROWALL-GENERAL via expandForD1, which is also the brand-general
  // required-conditions key — same id list works for both queries.
  const requiredConditions = await d1Query(
    PARAMS_DB_ID,
    `SELECT model_id, condition, where_expected, absence_consequence, source_doc FROM required_conditions WHERE brand = 'Euro-Wall' AND model_id IN (${placeholders})`,
    modelIds
  );

  const [queryVector] = await embedText([combinedText]);
  const semanticMatches = await vectorizeQuery(VECTORIZE_INDEX, queryVector, { topK: 5, returnMetadata: 'all' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { blocks: drawingBlocks, attachedPdfSheets, omittedPdfSheets } = buildDrawingInputBlocks(sheets);
  if (omittedPdfSheets.length) {
    console.error(`Euro-Wall specialist: PDF page attachment omitted for sheet(s) ${omittedPdfSheets.join(', ')} — per-call attachment byte budget exceeded; sent as extracted text only.`);
  }
  const userContent = [
    { type: 'text', text: 'DRAWING INPUT:' },
    ...drawingBlocks,
    {
      type: 'text',
      text: `EXACT PARAMETERS (D1):\n${JSON.stringify(params, null, 2)}\n\nSEMANTIC CONTEXT (Vectorize):\n${JSON.stringify(
        semanticMatches.map((m) => ({ id: m.id, score: m.score, text: m.metadata?.text, section: m.metadata?.section })),
        null,
        2
      )}\n\nREQUIRED CONDITIONS (D1) — verify each appears somewhere in the drawing input; flag every one that does not:\n${JSON.stringify(requiredConditions, null, 2)}`,
    },
  ];

  const { result: rawFindings } = await callAndParseJson(anthropic, {
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 8192,
    system: SYSTEM_PROMPT,
    userContent,
  });
  const { findings, warnings: guardWarnings } = guardFindings(rawFindings);
  for (const w of guardWarnings) console.error(`Euro-Wall findings guard [${w.type}]: ${w.detail}`);
  return {
    sheetsProcessed: sheets.map((s) => s.sheetNumber),
    pdfPagesAttached: attachedPdfSheets,
    modelIdsDetected: modelIds,
    paramsUsed: params,
    requiredConditionsUsed: requiredConditions,
    semanticMatches,
    findings,
    guardWarnings,
  };
}
