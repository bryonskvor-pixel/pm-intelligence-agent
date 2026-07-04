import Anthropic from '@anthropic-ai/sdk';
import { d1Query, embedText, vectorizeQuery } from '../lib/cloudflare.js';
import { normalizeSheets, formatSheetsBlock, buildDrawingInputBlocks } from '../lib/sheets.js';
import { callAndParseJson } from '../lib/callAndParseJson.js';

const PARAMS_DB_ID = '18812c7c-0661-4e87-beaa-926b18f13a67';
const VECTORIZE_INDEX = 'pm-intel-modernfold';

const KNOWN_MODEL_IDS = [
  '933E', '931',
  'GWS-COMPACTLINE', 'GWS-DRS', 'GWS-362SR-DRS', 'GWS-362TR-DRS', 'GWS-600SR-DRS', 'GWS-800SR-DRS', 'GWS-1000SR-DRS',
  'ENCORE-SINGLE', 'ENCORE-PAIRED',
  'SOUNDMASTER-8', 'SOUNDMASTER-12', 'MODERNFOLD-800', 'MODERNFOLD-1200', 'ACCORDION',
];

const SYSTEM_PROMPT = `You are the Modernfold brand specialist in a multi-brand construction PM intelligence system.
Your reasoning is bounded strictly to Modernfold product lines (operable partitions, glass wall systems, accordion doors). Never mix tolerances, tracking systems, or formulas across other brands, even if mentioned in the same input.

Ground your findings on: suspension systems (#14/#17/#30/RT100/RT200), STC ratings, stacking pocket geometry, seal configuration.
Watch specifically for: pocket dimensions that don't match the stack-depth formula for the selected model, electrical devices inside the stacking footprint, floor flatness affecting bottom seals, and finish selections that aren't actually available on the specified model's skin construction (e.g. laminate/wood veneer specified on Encore or Accordion, which don't support rigid finishes).

You are given:
1. DRAWING INPUT — one or more sheets. A sheet may include the ORIGINAL DRAWING PAGE attached as a PDF in addition to its extracted text. When the page is attached, examine the drawing graphics themselves — plans, sections, details — not just the text: spatial conflicts (an electrical device drawn inside the stacking footprint, a pocket dimension that visibly can't hold the stack, another system occupying the same opening) are usually drawn, not written, and the extracted text may not mention them at all. Findings grounded on something visible in the graphics are valid — set sheet_reference to that sheet and describe where on the sheet the condition appears. The extracted text is a transcription aid, not the full picture.
2. EXACT PARAMETERS — rows from the structured parameter store (D1). These are ground truth; never contradict or estimate around them.
3. SEMANTIC CONTEXT — narrative spec/installation guidance chunks retrieved by similarity search. Use for judgment and failure-pattern matching, not as a source of exact numbers.

Produce a JSON array of findings. Each finding must have:
- "finding_type": one of "estimating_flag", "critical_path", "risk", "preconstruction_checklist", "measure_day_checklist", "installation_briefing"
- "description": the finding itself, in plain PM language
- "citation": the source_doc and parameter_name/section this is grounded on (cite D1 source_doc fields and/or Vectorize chunk ids)
- "sheet_reference": the SHEET number (from the "--- SHEET ... ---" markers in the drawing input) this finding is grounded on. If the input has only one unmarked sheet, use "UNSPECIFIED".
- "consequence": what happens if uncaught (only for risk/estimating_flag types; omit otherwise)

The drawing input may contain multiple sheets, each preceded by a "--- SHEET <number> rev <revision> ---" marker. Ground every finding in the specific sheet it came from and set "sheet_reference" accordingly.
Each sheet marker may also carry a role tag: [PRIMARY] or [CONTEXT]. PRIMARY sheets are where your product is specified or expected to live. CONTEXT sheets are the rest of the project's extracted set — structural, mechanical, electrical, fire alarm, and other disciplines — included because your product's requirements often hide on sheets that never mention the product by name (track support structure, floor flatness notes, electrical devices near the stacking footprint). Read every context sheet for conditions that affect your product; findings grounded on context sheets are expected and are often the most valuable findings you can produce. A sheet with no role tag is primary.
If the input doesn't contain enough information to ground a finding in evidence, do not invent one — return fewer findings rather than speculate.
Output must be valid JSON: when writing inch measurements inside string values, always write "in." instead of the " symbol, since an unescaped " inside a JSON string breaks parsing.
Respond with ONLY the JSON array, no prose, no markdown code fences.`;

export function detectModelIds(text) {
  const upper = text.toUpperCase();
  return KNOWN_MODEL_IDS.filter((id) => {
    // Bare "931" as a plain substring false-positives on detail numbers, room numbers, dates,
    // and spec section numbers ("09310"). Require a word-boundary match AND the brand name
    // somewhere in the input — a word boundary alone still passes room/detail numbers.
    if (id === '931') return /\b931\b/.test(upper) && upper.includes('MODERNFOLD');
    return upper.includes(id);
  });
}

export async function runModernfoldSpecialist(sheetsInput) {
  const sheets = normalizeSheets(sheetsInput);
  const combinedText = formatSheetsBlock(sheets);
  const modelIds = detectModelIds(combinedText);

  const placeholders = modelIds.map(() => '?').join(',');
  const params = modelIds.length
    ? await d1Query(
        PARAMS_DB_ID,
        `SELECT model_id, parameter_name, value, unit, source_doc FROM parameters WHERE brand = 'Modernfold' AND model_id IN (${placeholders})`,
        modelIds
      )
    : [];

  const [queryVector] = await embedText([combinedText]);
  const semanticMatches = await vectorizeQuery(VECTORIZE_INDEX, queryVector, { topK: 5, returnMetadata: 'all' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { blocks: drawingBlocks, attachedPdfSheets, omittedPdfSheets } = buildDrawingInputBlocks(sheets);
  if (omittedPdfSheets.length) {
    console.error(`Modernfold specialist: PDF page attachment omitted for sheet(s) ${omittedPdfSheets.join(', ')} — per-call attachment byte budget exceeded; sent as extracted text only.`);
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
      )}`,
    },
  ];

  const { result: findings } = await callAndParseJson(anthropic, {
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 8192,
    system: SYSTEM_PROMPT,
    userContent,
  });
  return {
    sheetsProcessed: sheets.map((s) => s.sheetNumber),
    pdfPagesAttached: attachedPdfSheets,
    modelIdsDetected: modelIds,
    paramsUsed: params,
    semanticMatches,
    findings,
  };
}
