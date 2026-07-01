import Anthropic from '@anthropic-ai/sdk';
import { d1Query, embedText, vectorizeQuery } from '../lib/cloudflare.js';

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
1. DRAWING INPUT — text describing a drawing sheet or condition for this project.
2. EXACT PARAMETERS — rows from the structured parameter store (D1). These are ground truth; never contradict or estimate around them. SKYFOLD-GENERAL rows apply across all Skyfold models unless a model-specific row overrides them.
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
  const upper = text.toUpperCase();
  const matches = KNOWN_MODEL_IDS.filter((id) => id !== 'SKYFOLD-GENERAL' && upper.includes(id.replace('SKYFOLD-', '')));
  return matches.length ? [...matches, 'SKYFOLD-GENERAL'] : ['SKYFOLD-GENERAL'];
}

export async function runSkyfoldSpecialist(drawingText) {
  const modelIds = detectModelIds(drawingText);

  const placeholders = modelIds.map(() => '?').join(',');
  const params = await d1Query(
    PARAMS_DB_ID,
    `SELECT model_id, parameter_name, value, unit, source_doc FROM parameters WHERE brand = 'Skyfold' AND model_id IN (${placeholders})`,
    modelIds
  );

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
