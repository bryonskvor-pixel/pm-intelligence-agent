import Anthropic from '@anthropic-ai/sdk';
import { d1Query, embedText, vectorizeQuery } from '../lib/cloudflare.js';
import { normalizeSheets, formatSheetsBlock } from '../lib/sheets.js';
import { callAndParseJson } from '../lib/callAndParseJson.js';

const PARAMS_DB_ID = '18812c7c-0661-4e87-beaa-926b18f13a67';
const VECTORIZE_INDEX = 'pm-intel-airolite';

const KNOWN_MODEL_IDS = [
  'AIROLITE-GENERAL',
  // Performance (weather-rated) louvers
  'K8206', 'K6776', 'T6636', 'AC153',
  // Bar grilles
  'AFG100', 'ABG100', 'CBG100', 'LBG100', 'GIG100', 'SLG100', 'AIROLITE-GRILLES-GENERAL',
  // Geometric grilles
  'CGG100', 'MG100', 'PDG100', 'GSG100', 'TG100',
  // Louver screens
  'ENCB609', 'ENCB6096', 'ENCB6500', 'SCB601', 'CV605', 'SV961', 'SV962',
  // Sun controls
  'ASC4', 'ASC6', 'AIROLITE-SUN-CONTROLS-GENERAL',
];

const SYSTEM_PROMPT = `You are the Airolite brand specialist in a multi-brand construction PM intelligence system.
Your reasoning is bounded strictly to Airolite's product lines: performance (weather-rated, drainable/combination) louvers, bar and geometric architectural grilles, louver screens, and airfoil-blade sun controls. Never mix tolerances, tracking systems, or formulas across other brands, even if mentioned in the same input.

These are DIFFERENT product categories with different rules — do not apply one category's criteria to another:
- Performance louvers (K8206, K6776, T6636, AC153): free-area/CFM geometry, wind-load rating (25 PSF standard — anything higher requires consulting Airolite directly, it is not a published option), and the beginning point of water penetration are the governing criteria. Only these are AMCA-tested for water penetration.
- Grilles and screens (AFG100/ABG100/CBG100/LBG100/GIG100/SLG100/CGG100/MG100/PDG100/GSG100/TG100 and the ENCB/SCB/CV/SV screen types): decorative/security/sight-and-solar products, NOT weather- or water-penetration-rated. 25 PSF wind load and a 72"x120" (or 120"x72") max single-section threshold apply, plus a PE-stamped weld shear calc (526 lb min) is required in submittals. Never treat a grille or screen as a substitute for a rated intake/exhaust louver.
- Sun controls (ASC4, ASC6): 25 PSF design load covering wind+snow/drift+seismic+dead load, a distinct 144"x48" max section size, and a documented anodize-finish risk (blades and outriggers use different aluminum alloys, so anodize is not recommended — color inconsistency).

Watch specifically for: blade angle or blade style changes on performance louvers that trade CFM for water resistance or vice versa (e.g. an adjustable louver's blade angle changed in the field to hit an airflow target without re-checking the water penetration consequence); a non-water-rated model (like AC153, which has NO published water penetration rating at all) specified on a weather-exposed exterior opening; a grille or screen model specified where a rated performance louver belongs; openings larger than a model's maximum single-section size (louver, grille, or sun control — each has its own threshold) with no reinforcing/mullion plan called out; anodize finish specified on a sun control or other multi-alloy assembly; and fastener/substrate combinations that risk electrolysis (dissimilar metal galvanic contact).

You are given:
1. DRAWING INPUT — text describing a drawing sheet or condition for this project.
2. EXACT PARAMETERS — rows from the structured parameter store (D1). These are ground truth; never contradict or estimate around them. AIROLITE-GENERAL rows apply across all models unless a model-specific row overrides them.
3. SEMANTIC CONTEXT — narrative spec/installation guidance chunks retrieved by similarity search. Use for judgment and failure-pattern matching, not as a source of exact numbers.

Produce a JSON array of findings. Each finding must have:
- "finding_type": one of "estimating_flag", "critical_path", "risk", "preconstruction_checklist", "measure_day_checklist", "installation_briefing"
- "description": the finding itself, in plain PM language
- "citation": the source_doc and parameter_name/section this is grounded on (cite D1 source_doc fields and/or Vectorize chunk ids)
- "sheet_reference": the SHEET number (from the "--- SHEET ... ---" markers in the drawing input) this finding is grounded on. If the input has only one unmarked sheet, use "UNSPECIFIED".
- "consequence": what happens if uncaught (only for risk/estimating_flag types; omit otherwise)

The drawing input may contain multiple sheets, each preceded by a "--- SHEET <number> rev <revision> ---" marker. Ground every finding in the specific sheet it came from and set "sheet_reference" accordingly.
If the input doesn't contain enough information to ground a finding in evidence, do not invent one — return fewer findings rather than speculate.
Output must be valid JSON: when writing inch measurements inside string values, always write "in." instead of the " symbol, since an unescaped " inside a JSON string breaks parsing.
Respond with ONLY the JSON array, no prose, no markdown code fences.`;

const GRILLE_MODEL_IDS = ['AFG100', 'ABG100', 'CBG100', 'LBG100', 'GIG100', 'SLG100', 'CGG100', 'MG100', 'PDG100', 'GSG100', 'TG100', 'ENCB609', 'ENCB6096', 'ENCB6500', 'SCB601', 'CV605', 'SV961', 'SV962'];
const SUN_CONTROL_MODEL_IDS = ['ASC4', 'ASC6'];
const CATEGORY_GENERAL_IDS = ['AIROLITE-GENERAL', 'AIROLITE-GRILLES-GENERAL', 'AIROLITE-SUN-CONTROLS-GENERAL'];

// Raw model matches only (no category-GENERAL fallback) — used by the router to decide brand relevance.
export function detectModelIds(text) {
  const upper = text.toUpperCase();
  return KNOWN_MODEL_IDS.filter((id) => !CATEGORY_GENERAL_IDS.includes(id) && upper.includes(id));
}

// Expanded for D1 lookup: always includes AIROLITE-GENERAL, plus per-category GENERAL rows when a category matches.
function expandForD1(matches) {
  const ids = new Set(matches);
  ids.add('AIROLITE-GENERAL');
  if (matches.some((id) => GRILLE_MODEL_IDS.includes(id))) ids.add('AIROLITE-GRILLES-GENERAL');
  if (matches.some((id) => SUN_CONTROL_MODEL_IDS.includes(id))) ids.add('AIROLITE-SUN-CONTROLS-GENERAL');
  return [...ids];
}

export async function runAiroliteSpecialist(sheetsInput) {
  const sheets = normalizeSheets(sheetsInput);
  const combinedText = formatSheetsBlock(sheets);
  const modelIds = expandForD1(detectModelIds(combinedText));

  const placeholders = modelIds.map(() => '?').join(',');
  const params = await d1Query(
    PARAMS_DB_ID,
    `SELECT model_id, parameter_name, value, unit, source_doc FROM parameters WHERE brand = 'Airolite' AND model_id IN (${placeholders})`,
    modelIds
  );

  const [queryVector] = await embedText([combinedText]);
  const semanticMatches = await vectorizeQuery(VECTORIZE_INDEX, queryVector, { topK: 5, returnMetadata: 'all' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userContent = `DRAWING INPUT:\n${combinedText}\n\nEXACT PARAMETERS (D1):\n${JSON.stringify(params, null, 2)}\n\nSEMANTIC CONTEXT (Vectorize):\n${JSON.stringify(
    semanticMatches.map((m) => ({ id: m.id, score: m.score, text: m.metadata?.text, section: m.metadata?.section })),
    null,
    2
  )}`;

  const { result: findings } = await callAndParseJson(anthropic, {
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    system: SYSTEM_PROMPT,
    userContent,
  });
  return {
    sheetsProcessed: sheets.map((s) => s.sheetNumber),
    modelIdsDetected: modelIds,
    paramsUsed: params,
    semanticMatches,
    findings,
  };
}
