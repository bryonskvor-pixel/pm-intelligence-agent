import Anthropic from '@anthropic-ai/sdk';

// Condensed, triage-specific relevance guidance per brand — deliberately NOT the full specialist
// system prompts (those carry exact tolerance/formula detail meant for diagnostic reasoning over
// a sheet's actual content, which would be wasted tokens here and would work against triage being
// cheap). This is "what kinds of sheets to look for," informed by the same domain knowledge.
const BRAND_TRIAGE_GUIDANCE = {
  Modernfold: `Operable partitions, glass wall systems, accordion doors. Likely relevant: partition/door schedules, reflected ceiling plans (stacking pocket and motor clearance), finish schedules (skin construction compatibility). Usually concentrated in a small number of sheets.`,
  Skyfold: `Vertically retractable acoustic walls. Likely relevant: reflected ceiling plans (plenum clearance, obstructions), structural sheets (overhead steel/header), electrical sheets (3-phase power), finish schedules. Usually concentrated in a small number of sheets.`,
  'Euro-Wall': `Folding/sliding/pivot glass door and window systems. Likely relevant: door/window schedules, exterior wall sections and sill details, structural sheets (header rigidity, wind load), finish/glazing schedules.`,
  Airolite: `Louvers, architectural grilles, louver screens, sun controls. Likely relevant: mechanical louver schedules, exterior elevations, wind-load/anchor details, finish schedules. Usually concentrated in a small number of sheets.`,
  'Smoke Guard': `Deployable fire/smoke curtains. Likely relevant: fire alarm plans, reflected ceiling plans (curtain travel path clearance), electrical sheets (dedicated circuits), code compliance/egress plans, door/opening schedules, and structural sheets showing header/wall-face clearance. This is the most cross-disciplinary of the five brands — do not treat every fire-alarm or egress sheet as automatically relevant just because the brand is life-safety-related; only include a sheet if this SPECIFIC product (a deployable curtain, not general fire-alarm/sprinkler/egress design) is plausibly in scope.`,
};

const SYSTEM_PROMPT = `You are a triage agent in a multi-brand construction PM intelligence system. You read a project's sheet index (sheet numbers, titles, disciplines — not full sheet content) and decide, for each of 5 product brands, which sheets are plausibly relevant enough to warrant full extraction.

This is a cheap first pass from titles alone, not a full read of sheet content. Bias toward inclusion when genuinely uncertain — it's much cheaper to extract one unnecessary sheet than to silently miss a relevant one. But do not include a sheet with no plausible connection just to be safe, and do not assume any of these 5 brands are present at all — many projects use none of them. If a project's sheet index shows no plausible connection to a brand, that brand's candidate list should be empty, not padded with loosely-related sheets.

Each brand's typical relevance pattern is different — some brands' relevant content is concentrated in a couple of sheets; others (especially life-safety-related products) are inherently cross-disciplinary and their relevant content, when the product genuinely is in scope, is legitimately spread across more sheet types. Size each brand's candidate list to genuine relevance, not a fixed count, and don't inflate a brand's list just because its general domain (e.g. fire/life-safety) appears elsewhere in the project for unrelated reasons (e.g. a standard fire alarm system with no deployable curtain product at all).

BRANDS:
${Object.entries(BRAND_TRIAGE_GUIDANCE)
  .map(([name, guidance]) => `- ${name}: ${guidance}`)
  .join('\n')}

Also transcribe "orderedSheetNumbers": the complete list of every sheet number in the index, in the exact order they're listed (all disciplines, not just the 5 brands above). Bid sets are almost always physically compiled in the same order as their own index, so this list doubles as an approximate map from sheet number to physical page position — list order matters, don't alphabetize or group it.

Output a single JSON object with one key per brand name above, each mapping to { "candidateSheetNumbers": [string], "reasoning": string }, plus a top-level "unclassifiedSheetNumbers" array for sheets with no plausible connection to any of the 5 brands, plus the top-level "orderedSheetNumbers" array described above.
Respond with ONLY the JSON object, no prose, no markdown code fences.`;

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
    // Normalized to the same shape as extraction.js's usage summary, so callers can sum usage
    // across pipeline stages without special-casing each stage's raw API response shape.
    const usage = {
      callCount: 1,
      inputTokens: message.usage.input_tokens || 0,
      outputTokens: message.usage.output_tokens || 0,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens || 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens || 0,
    };
    return { result: JSON.parse(cleaned), usage };
  } catch (err) {
    if (retryReminder) {
      console.error('RAW MODEL OUTPUT (after retry):\n', cleaned);
      throw err;
    }
    return callAndParse(anthropic, userContent, 'Your previous response was invalid JSON. Re-emit it as strictly valid JSON.');
  }
}

// indexText: raw text of a project's sheet index/cover page (e.g. extracted sheet 0's rawText) —
// the free-form listing of sheet numbers + titles most sets already have on their cover sheet.
export async function triageFromIndexText(indexText) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return callAndParse(anthropic, `SHEET INDEX:\n${indexText}`);
}
