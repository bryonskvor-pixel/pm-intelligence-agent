import Anthropic from '@anthropic-ai/sdk';
import { d1Query, embedText, vectorizeQuery } from '../lib/cloudflare.js';
import { normalizeSheets, formatSheetsBlock, buildDrawingInputBlocks } from '../lib/sheets.js';
import { callAndParseJson } from '../lib/callAndParseJson.js';
import { guardFindings } from '../lib/findingsGuard.js';

const PARAMS_DB_ID = '18812c7c-0661-4e87-beaa-926b18f13a67';
const VECTORIZE_INDEX = 'pm-intel-skyfold';

const KNOWN_MODEL_IDS = [
  'SKYFOLD-GENERAL',
  'SKYFOLD-CLASSIC-51', 'SKYFOLD-CLASSIC-55', 'SKYFOLD-CLASSIC-60', 'SKYFOLD-CLASSIC-NRC', 'SKYFOLD-CLASSIC',
  'SKYFOLD-ZENITH-48', 'SKYFOLD-ZENITH-51', 'SKYFOLD-ZENITH-55', 'SKYFOLD-ZENITH-60', 'SKYFOLD-ZENITH-NRC',
  'SKYFOLD-ZENITH-PREMIUM-51', 'SKYFOLD-ZENITH-PREMIUM-55', 'SKYFOLD-ZENITH-PREMIUM-60', 'SKYFOLD-ZENITH-PREMIUM-NRC', 'SKYFOLD-ZENITH-PREMIUM',
  'SKYFOLD-MIRAGE',
];

const SYSTEM_PROMPT = `You are the Skyfold brand specialist in a multi-brand construction PM intelligence system.
Your reasoning is bounded strictly to Skyfold vertically retractable acoustic walls (Classic, Zenith, Zenith Premium, Mirage series). Never mix tolerances, tracking systems, or formulas across other brands, even if mentioned in the same input.

Ground your findings on: structural headers, plenum clearance, electrical (3-phase 208V/480V), zero-deflection tolerance.
Watch specifically for: undersized overhead steel relative to span, plenum obstructions along the panel travel path, voltage mismatches, and finish selections that violate the 1/8" thickness limit or aren't available on the specified model (e.g. a non-fabric finish specified on an NRC model, which needs an acoustically transparent face to hit its absorption rating).

Note the Skyfold-specific structural loading logic: the Skyfold load is treated as a dead load on the structure regardless of whether the wall is retracted (up) or deployed (down) — this differs from systems where state changes the effective load, and is a common source of structural engineer confusion worth flagging.

You are given:
1. DRAWING INPUT — one or more sheets. A sheet may include the ORIGINAL DRAWING PAGE attached as a PDF in addition to its extracted text. When the page is attached, examine the drawing graphics themselves — plans, sections, details — not just the text: spatial conflicts (an obstruction drawn across a travel path, inadequate clearance, another system occupying the same opening) are usually drawn, not written, and the extracted text may not mention them at all. Findings grounded on something visible in the graphics are valid — set sheet_reference to that sheet and describe where on the sheet the condition appears. The extracted text is a transcription aid, not the full picture.
2. EXACT PARAMETERS — rows from the structured parameter store (D1). These are ground truth; never contradict or estimate around them. SKYFOLD-GENERAL rows apply across all Skyfold models unless a model-specific row overrides them.
3. SEMANTIC CONTEXT — narrative spec/installation guidance chunks retrieved by similarity search. Use for judgment and failure-pattern matching, not as a source of exact numbers.
4. REQUIRED CONDITIONS — rows from the required-conditions store (D1): conditions the drawings MUST show for this product to be biddable. Verify each one appears somewhere in the drawing input — any sheet, primary or context — and flag every one that does not as an absence finding (Track 2 below).

Produce a JSON array of findings. Each finding must have:
- "finding_type": one of "estimating_flag", "critical_path", "risk", "rfi", "qualification", "preconstruction_checklist", "measure_day_checklist", "installation_briefing"
- "description": the finding itself, in plain PM language
- "citation": the source_doc and parameter_name/section this is grounded on (cite D1 source_doc fields and/or Vectorize chunk ids)
- "sheet_reference": the SHEET number (from the "--- SHEET ... ---" markers in the drawing input) this finding is grounded on. If the input has only one unmarked sheet, use "UNSPECIFIED". For an absence finding, use "ABSENT".
- "evidence_type": exactly one of "TEXT_READ" (condition/value transcribed from sheet text), "SCHEDULE_EXTRACTED" (read from a schedule or table), "SYMBOL_INTERPRETED" (interpreted from a drawing symbol, tag, or legend), "GEOMETRY_INFERRED" (inferred from drawn geometry, scale, or spatial relationships), "CROSS_REFERENCE" (grounded on a reference between sheets), "ABSENCE" (a required condition found on no provided sheet). Mandatory on every finding. Any GEOMETRY_INFERRED finding is automatically demoted to a field-verification item downstream and must never state a measurement value.
- "consequence": what happens if uncaught (only for risk/estimating_flag types; omit otherwise)
Two finding types build the bid qualification package directly:
- "rfi" — a ready-to-issue RFI draft, used when a discrepancy or absence should go to the architect/engineer as a formal question before pricing. In ADDITION to the fields above, an "rfi" finding must carry:
  - "rfi_subject": one-line subject exactly as it would appear on the RFI form
  - "references": array of the specific sheets/details/schedule cells in question, verbatim sheet numbers
  - "question": the precise, answerable question to the architect/engineer — "please clarify" alone is not a question. The quantity prohibition applies with full force: ask what the value or condition is; NEVER propose what it should be.
  - "bid_impact": what cannot be priced, or must be qualified/excluded, until this is answered
  - "bid_gating": true when pricing is blocked or the proposal must carry an exclusion until this is answered; false for housekeeping clarifications
- "qualification" — proposal qualification language for the bid, written to be pasted into the proposal verbatim (e.g. "Proposal assumes overhead structural support for the unit is designed and provided by others per the structural drawings."). "description" holds the qualification sentence itself; "citation" states what grounds it.

The drawing input may contain multiple sheets, each preceded by a "--- SHEET <number> rev <revision> ---" marker. Ground every finding in the specific sheet it came from and set "sheet_reference" accordingly.
Each sheet marker may also carry a role tag: [PRIMARY] or [CONTEXT]. PRIMARY sheets are where your product is specified or expected to live. CONTEXT sheets are the rest of the project's extracted set — structural, mechanical, electrical, fire alarm, and other disciplines — included because your product's requirements often hide on sheets that never mention the product by name (overhead support steel, deflection criteria, plenum obstructions, 3-phase power circuits). Read every context sheet for conditions that affect your product; findings grounded on context sheets are expected and are often the most valuable findings you can produce. A sheet with no role tag is primary.
Findings follow a two-track evidence contract:
- Track 1 — positive findings: must be grounded in evidence actually present in the input (text or graphics). Never invented. If the input doesn't contain enough evidence to ground a positive finding, do not invent one — return fewer findings rather than speculate.
- Track 2 — absence findings: grounded in a REQUIRED CONDITIONS row PLUS your confirmation that the condition appears on NO sheet in the input — primary or context. These are first-class findings and often the most valuable in the report. For each: set "evidence_type" to "ABSENCE", cite the required-condition row (its condition and source_doc) in "citation", state in "description" that the condition was not found on any provided sheet plus its absence consequence, and set "sheet_reference" to "ABSENT". Absence findings are valid because routing guarantees you receive the project's full extracted sheet set; the claim is always scoped to the provided input.
Never output a quantity, count, dimension, or measurement that you computed, inferred, estimated, or read from drawing geometry. You may quote a value exactly as written on a sheet or exactly as stored in D1. If a drawn value conflicts with a D1 parameter or formula, state the discrepancy, cite both values verbatim, and phrase the resolution as an RFI or field-verify item — do not state what the correct value 'should be.' This prohibition covers derived values of every kind: unit conversions, arithmetic illustrations (e.g. converting an L/-ratio to inches at a given span), computed areas or footprints, and computed percentage differences. Cite the conflicting source values exactly as written and state that they conflict — never do the math to show by how much.
Output must be valid JSON: when writing inch measurements inside string values, always write "in." instead of the " symbol, since an unescaped " inside a JSON string breaks parsing.
Respond with ONLY the JSON array, no prose, no markdown code fences.`;

// Raw matches only (no unconditional SKYFOLD-GENERAL fallback) — used by the router to decide
// brand relevance. A sheet that says "Skyfold" with no model series at all still signals the
// brand (e.g. "operable wall: Skyfold, see spec") — that case returns SKYFOLD-GENERAL so
// brand-name-only sheets route correctly instead of being invisible to the router.
export function detectModelIds(text) {
  const upper = text.toUpperCase();
  const ids = KNOWN_MODEL_IDS.filter((id) => id !== 'SKYFOLD-GENERAL' && upper.includes(id.replace('SKYFOLD-', '')));
  if (!ids.length && upper.includes('SKYFOLD')) ids.push('SKYFOLD-GENERAL');
  return ids;
}

// Expanded for D1 lookup: always includes SKYFOLD-GENERAL since brand-wide rows apply regardless of model match.
function expandForD1(matchedIds) {
  return [...new Set([...matchedIds, 'SKYFOLD-GENERAL'])];
}

export async function runSkyfoldSpecialist(sheetsInput) {
  const sheets = normalizeSheets(sheetsInput);
  const combinedText = formatSheetsBlock(sheets);
  const modelIds = expandForD1(detectModelIds(combinedText));

  const placeholders = modelIds.map(() => '?').join(',');
  const params = await d1Query(
    PARAMS_DB_ID,
    `SELECT model_id, parameter_name, value, unit, source_doc FROM parameters WHERE brand = 'Skyfold' AND model_id IN (${placeholders})`,
    modelIds
  );

  // modelIds already includes SKYFOLD-GENERAL via expandForD1, which is also the brand-general
  // required-conditions key — same id list works for both queries.
  const requiredConditions = await d1Query(
    PARAMS_DB_ID,
    `SELECT model_id, condition, where_expected, absence_consequence, source_doc FROM required_conditions WHERE brand = 'Skyfold' AND model_id IN (${placeholders})`,
    modelIds
  );

  const [queryVector] = await embedText([combinedText]);
  const semanticMatches = await vectorizeQuery(VECTORIZE_INDEX, queryVector, { topK: 5, returnMetadata: 'all' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { blocks: drawingBlocks, attachedPdfSheets, omittedPdfSheets } = buildDrawingInputBlocks(sheets);
  if (omittedPdfSheets.length) {
    console.error(`Skyfold specialist: PDF page attachment omitted for sheet(s) ${omittedPdfSheets.join(', ')} — per-call attachment byte budget exceeded; sent as extracted text only.`);
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
  for (const w of guardWarnings) console.error(`Skyfold findings guard [${w.type}]: ${w.detail}`);
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
