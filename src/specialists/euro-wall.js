import Anthropic from '@anthropic-ai/sdk';
import { d1Query, embedText, vectorizeQuery } from '../lib/cloudflare.js';

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
1. DRAWING INPUT — text describing a drawing sheet or condition for this project.
2. EXACT PARAMETERS — rows from the structured parameter store (D1). These are ground truth; never contradict or estimate around them. EUROWALL-GENERAL rows apply across all product lines unless a line-specific row overrides them.
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

  ids.add('EUROWALL-GENERAL');
  return [...ids];
}

export async function runEuroWallSpecialist(drawingText) {
  const modelIds = detectModelIds(drawingText);

  const placeholders = modelIds.map(() => '?').join(',');
  const params = await d1Query(
    PARAMS_DB_ID,
    `SELECT model_id, parameter_name, value, unit, source_doc FROM parameters WHERE brand = 'Euro-Wall' AND model_id IN (${placeholders})`,
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
