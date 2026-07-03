// Shared "call Claude, strip fences, parse JSON, retry once" logic used by all 5 brand
// specialists and triage.js. Extracted after a real duplication was found: each of the 6 call
// sites carried its own byte-for-byte-identical copy, and a fix made once in extraction.js
// (distinguishing a genuine JSON-parse failure from a network/API error before deciding whether
// to retry) never propagated to any of them — a transient network error in any of the 6 would get
// a nonsensical "your JSON was invalid, please re-emit it" retry, which cannot fix a network
// error, wastes a call, and obscures the real error in logs.

const DEFAULT_RETRY_REMINDER =
  'Your previous response was invalid JSON. Re-emit it as strictly valid JSON, escaping every double-quote inside string values.';

function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

function normalizeUsage(rawUsage) {
  return {
    callCount: 1,
    inputTokens: rawUsage.input_tokens || 0,
    outputTokens: rawUsage.output_tokens || 0,
    cacheCreationInputTokens: rawUsage.cache_creation_input_tokens || 0,
    cacheReadInputTokens: rawUsage.cache_read_input_tokens || 0,
  };
}

async function callOnce(anthropic, { model, maxTokens, system, userContent }, retryReminder) {
  const message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: retryReminder ? `${userContent}\n\n${retryReminder}` : userContent }],
  });
  const usage = normalizeUsage(message.usage);

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) {
    const err = new Error('Response contained no text content block.');
    err.rawOutput = '';
    err.usage = usage;
    throw err;
  }
  const cleaned = stripCodeFences(textBlock.text);
  try {
    return { result: JSON.parse(cleaned), usage };
  } catch (err) {
    err.rawOutput = cleaned;
    err.usage = usage;
    throw err;
  }
}

// Calls Claude, strips markdown code fences, parses JSON, and retries once — but only on a
// genuine JSON-parse failure (rawOutput set on the thrown error), never on a network/API error,
// which this retry reminder cannot fix. Returns { result, usage } — usage is already normalized
// to the same shape extraction.js's usage tracker produces, so any caller can use it directly
// without knowing Anthropic's raw snake_case response shape.
export async function callAndParseJson(anthropic, { model, maxTokens, system, userContent }, retryReminder = null) {
  try {
    return await callOnce(anthropic, { model, maxTokens, system, userContent }, retryReminder);
  } catch (err) {
    const isJsonParseFailure = err.rawOutput !== undefined;
    if (!isJsonParseFailure) throw err;
    if (retryReminder) {
      console.error('RAW MODEL OUTPUT (after retry):\n', err.rawOutput);
      throw err;
    }
    return callAndParseJson(anthropic, { model, maxTokens, system, userContent }, DEFAULT_RETRY_REMINDER);
  }
}
