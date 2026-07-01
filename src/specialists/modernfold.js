import Anthropic from '@anthropic-ai/sdk';
import { d1Query, embedText, vectorizeQuery } from '../lib/cloudflare.js';

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
1. DRAWING INPUT — text describing a drawing sheet or condition for this project.
2. EXACT PARAMETERS — rows from the structured parameter store (D1). These are ground truth; never contradict or estimate around them.
3. SEMANTIC CONTEXT — narrative spec/installation guidance chunks retrieved by similarity search. Use for judgment and failure-pattern matching, not as a source of exact numbers.

Produce a JSON array of findings. Each finding must have:
- "finding_type": one of "estimating_flag", "critical_path", "risk", "preconstruction_checklist", "measure_day_checklist", "installation_briefing"
- "description": the finding itself, in plain PM language
- "citation": the source_doc and parameter_name/section this is grounded on (cite D1 source_doc fields and/or Vectorize chunk ids)
- "consequence": what happens if uncaught (only for risk/estimating_flag types; omit otherwise)

If the input doesn't contain enough information to ground a finding in evidence, do not invent one — return fewer findings rather than speculate.
Output must be valid JSON: when writing inch measurements inside string values, always write "in." instead of the " symbol, since an unescaped " inside a JSON string breaks parsing.
Respond with ONLY the JSON array, no prose, no markdown code fences.`;

function detectModelIds(text) {
  return KNOWN_MODEL_IDS.filter((id) => text.toUpperCase().includes(id));
}

export async function runModernfoldSpecialist(drawingText) {
  const modelIds = detectModelIds(drawingText);

  const placeholders = modelIds.map(() => '?').join(',');
  const params = modelIds.length
    ? await d1Query(
        PARAMS_DB_ID,
        `SELECT model_id, parameter_name, value, unit, source_doc FROM parameters WHERE brand = 'Modernfold' AND model_id IN (${placeholders})`,
        modelIds
      )
    : [];

  const [queryVector] = await embedText([drawingText]);
  const semanticMatches = await vectorizeQuery(VECTORIZE_INDEX, queryVector, { topK: 5, returnMetadata: 'all' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userContent = `DRAWING INPUT:\n${drawingText}\n\nEXACT PARAMETERS (D1):\n${JSON.stringify(params, null, 2)}\n\nSEMANTIC CONTEXT (Vectorize):\n${JSON.stringify(
    semanticMatches.map((m) => ({ id: m.id, score: m.score, text: m.metadata?.text, section: m.metadata?.section })),
    null,
    2
  )}`;

  const findings = await callAndParse(anthropic, userContent);
  return {
    modelIdsDetected: modelIds,
    paramsUsed: params,
    semanticMatches,
    findings,
  };
}

async function callAndParse(anthropic, userContent, retryReminder) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: retryReminder ? `${userContent}\n\n${retryReminder}` : userContent }],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    if (retryReminder) {
      console.error('RAW MODEL OUTPUT (after retry):\n', cleaned);
      throw err;
    }
    return callAndParse(anthropic, userContent, 'Your previous response was invalid JSON. Re-emit it as strictly valid JSON, escaping every double-quote inside string values.');
  }
}
