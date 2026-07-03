import Anthropic from '@anthropic-ai/sdk';
import { splitPdfIntoPages, batchPages } from './pdfSplit.js';
import { applyExtractionGuards } from './extractionGuards.js';

const MAX_TOKENS = 16000;

const SYSTEM_PROMPT = `You are a construction print extraction agent. You read commercial construction drawing sheets (architectural, structural, mechanical, electrical, plumbing, civil, fire protection, etc.) and transcribe their content into structured, complete, faithful data. You do not reason about PM implications, code compliance, or product specifics — that is a downstream step. Your only job is complete, accurate transcription and identification of cross-references.

You will be given one or more sheets as PDF documents, each preceded by a text label "PAGE INDEX <n>". Process every page given, in order, and return exactly one JSON object per page in the same order.

For each page, extract:
- "pageIndex": the integer from its "PAGE INDEX <n>" label
- "sheetNumber": the sheet number from the title block (e.g. "A-405", "S-501"). If illegible or absent, use null.
- "revision": the revision number/letter shown in the title block, or null.
- "date": the date shown in the title block, or null.
- "discipline": your best read of the discipline this sheet belongs to (e.g. "architectural", "structural", "mechanical", "electrical", "plumbing", "civil", "fire_protection", "specifications", "cover", "other").
- "title": the sheet title (e.g. "LEVEL 2 REFLECTED CEILING PLAN").
- "schedules": an array of every schedule/table visible on the sheet, each as { "name": string, "columns": [string], "rows": [[string]] }. Transcribe every row completely — do not summarize, truncate, or skip rows for length.
- "dimensions": an array of every dimension, tolerance, or numeric callout with meaningful context, each as { "value": string, "context": string }. Always write inches as "in." never the " symbol.
- "keynotes": an array of every keynote/callout, each as { "marker": string, "text": string }.
- "tags": an array of every unique equipment/wall/door/opening tag visible on the sheet (e.g. "OW-1", "SC-1", "L-3", room numbers). Include tags shown in schedules and tags shown directly on the plan/elevation graphics.
- "gridlines": an array of every gridline reference visible on the sheet (e.g. "D-4", "D-9", "B-7").
- "crossReferences": an array of every explicit reference to another sheet. "targetSheet" must be ONLY the clean sheet number being referenced (e.g. "S-501", "A-601") — never the surrounding phrase or a local detail/section number. Put the full original phrase in "context" instead. For "SEE S-501 FOR STEEL": targetSheet "S-501", context "SEE S-501 FOR STEEL". For "SIM 3/A-601": targetSheet "A-601", context "SIM 3/A-601". Each entry is { "targetSheet": string, "context": string }.
- "rawText": a complete, faithful transcription of all readable text on the sheet — general notes, legends, everything not already captured structurally above. This is the ground-truth record other agents will cite from, so completeness matters more than brevity.

If a page is unreadable, blank, or not a drawing sheet (e.g. a divider page), still return an object for it with sheetNumber null and a "notes" field explaining why.
Output must be valid JSON: an array of exactly one object per page given, in the same order, nothing else — no prose, no markdown code fences. When writing inch measurements inside string values, always write "in." instead of the " symbol, since an unescaped " inside a JSON string breaks parsing.`;

class TruncatedBatchError extends Error {}

// Accumulates real API usage across every call in a run (including retries and recursive
// splits), so cost is a reported fact instead of an inference from the log.
export function createUsageTracker() {
  const calls = [];
  return {
    record(usage, meta) {
      calls.push({ ...usage, ...meta });
    },
    summary() {
      const totals = calls.reduce(
        (acc, c) => ({
          inputTokens: acc.inputTokens + (c.input_tokens || 0),
          outputTokens: acc.outputTokens + (c.output_tokens || 0),
          cacheCreationInputTokens: acc.cacheCreationInputTokens + (c.cache_creation_input_tokens || 0),
          cacheReadInputTokens: acc.cacheReadInputTokens + (c.cache_read_input_tokens || 0),
        }),
        { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }
      );
      return { callCount: calls.length, calls, ...totals };
    },
  };
}

// Sums usage objects already in createUsageTracker().summary()'s normalized shape (this file's
// own extraction usage, and triage.js's, which was deliberately normalized to match) across
// pipeline stages. Shared so every caller totals the same 5 fields — a hand-rolled sum is how
// cache token counts silently went missing from a cost estimate once already.
export function sumUsageStages(usageStages) {
  return Object.values(usageStages).reduce(
    (acc, u) => ({
      callCount: acc.callCount + (u.callCount || 0),
      inputTokens: acc.inputTokens + (u.inputTokens || 0),
      outputTokens: acc.outputTokens + (u.outputTokens || 0),
      cacheCreationInputTokens: acc.cacheCreationInputTokens + (u.cacheCreationInputTokens || 0),
      cacheReadInputTokens: acc.cacheReadInputTokens + (u.cacheReadInputTokens || 0),
    }),
    { callCount: 0, inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }
  );
}

// Rough estimate only, at Claude Sonnet's published per-MTok rates as of this writing
// ($3 input / $15 output / $3.75 cache write / $0.30 cache read) — verify current pricing
// before treating this as a real budget number; the token counts feeding it are exact, this isn't.
export function estimateCostUSD(usage) {
  return (
    (usage.inputTokens / 1e6) * 3 +
    (usage.outputTokens / 1e6) * 15 +
    (usage.cacheCreationInputTokens / 1e6) * 3.75 +
    (usage.cacheReadInputTokens / 1e6) * 0.3
  );
}

// pageBatch: [{ index, bytes }] — index is the page's real position in the original document,
// which may be sparse/non-contiguous when extracting a triaged candidate subset.
function buildBatchContent(pageBatch) {
  const content = [];
  pageBatch.forEach((page) => {
    content.push({ type: 'text', text: `PAGE INDEX ${page.index}` });
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: Buffer.from(page.bytes).toString('base64'),
      },
    });
  });
  content.push({
    type: 'text',
    text: `Extract all ${pageBatch.length} pages above per your instructions. Return a JSON array of exactly ${pageBatch.length} objects, in page index order.`,
  });
  return content;
}

async function callOnce(anthropic, content, maxTokens, retryReminder, usageTracker, meta) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: maxTokens,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: retryReminder ? [...content, { type: 'text', text: retryReminder }] : content }],
  });
  usageTracker.record(message.usage, meta);

  // Check truncation before ever touching message.content — a truncated response is exactly the
  // case most likely to also lack a complete/any text block, and this check needs nothing from it.
  if (message.stop_reason === 'max_tokens') {
    throw new TruncatedBatchError(`Response truncated at max_tokens=${maxTokens} before completing valid JSON.`);
  }

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) {
    // Not a network/API error — the call succeeded, but the response had no text content to
    // parse. Setting rawOutput routes this into the "re-emit as valid JSON" retry path, which is
    // the right response here (unlike a genuine network error, which shouldn't get that retry).
    const err = new Error('Response contained no text content block.');
    err.rawOutput = '';
    throw err;
  }
  const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    err.rawOutput = cleaned;
    throw err;
  }
}

async function callAndParse(anthropic, content, expectedCount, maxTokens, usageTracker, meta, retryReminder) {
  let parsed;
  try {
    parsed = await callOnce(anthropic, content, maxTokens, retryReminder, usageTracker, meta);
  } catch (err) {
    if (err instanceof TruncatedBatchError) throw err;

    // Only a genuine JSON-parse failure (rawOutput set in callOnce) should trigger the
    // "re-emit as valid JSON" retry — that reminder is meaningless for a network/API error,
    // where the request never even reached a model response to parse.
    const isJsonParseFailure = err.rawOutput !== undefined;
    if (!isJsonParseFailure) {
      console.error(`Non-JSON error during extraction call (${err.constructor?.name || 'Error'}): ${err.message}`);
      throw err;
    }
    if (retryReminder) {
      console.error('RAW MODEL OUTPUT (after retry):\n', err.rawOutput);
      throw err;
    }
    return callAndParse(
      anthropic,
      content,
      expectedCount,
      maxTokens,
      usageTracker,
      meta,
      'Your previous response was invalid JSON. Re-emit it as strictly valid JSON, escaping every double-quote inside string values.'
    );
  }

  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    if (retryReminder) {
      throw new Error(`Extraction batch returned ${Array.isArray(parsed) ? parsed.length : typeof parsed} items, expected ${expectedCount}`);
    }
    return callAndParse(
      anthropic,
      content,
      expectedCount,
      maxTokens,
      usageTracker,
      meta,
      `Your previous response did not contain exactly ${expectedCount} JSON objects, one per page given. Re-emit the full JSON array with exactly ${expectedCount} objects.`
    );
  }
  return parsed;
}

// Extracts one batch of pages, recovering from output-token truncation by splitting the
// batch (not just retrying the same oversized call, which would truncate again) and, for a
// single page that still truncates, escalating max_tokens before giving up.
async function extractBatchWithRecovery(anthropic, pageBatch, usageTracker, maxTokens = MAX_TOKENS) {
  const content = buildBatchContent(pageBatch);
  const label = pageBatch.map((p) => p.index).join(',');
  try {
    return await callAndParse(anthropic, content, pageBatch.length, maxTokens, usageTracker, {
      pageIndices: pageBatch.map((p) => p.index),
      pageCount: pageBatch.length,
      maxTokens,
    });
  } catch (err) {
    if (!(err instanceof TruncatedBatchError)) throw err;

    if (pageBatch.length > 1) {
      const mid = Math.ceil(pageBatch.length / 2);
      const firstHalf = pageBatch.slice(0, mid);
      const secondHalf = pageBatch.slice(mid);
      console.error(`Batch [${label}] truncated at ${pageBatch.length} pages — splitting into ${firstHalf.length} + ${secondHalf.length}.`);
      const [firstResults, secondResults] = await Promise.all([
        extractBatchWithRecovery(anthropic, firstHalf, usageTracker, maxTokens),
        extractBatchWithRecovery(anthropic, secondHalf, usageTracker, maxTokens),
      ]);
      return [...firstResults, ...secondResults];
    }

    const nextMaxTokens = maxTokens * 2;
    if (nextMaxTokens > 64000) {
      throw new Error(`Page ${label} still truncates even at max_tokens=${maxTokens} alone — content is too dense for a single extraction call.`);
    }
    console.error(`Single page ${label} truncated at max_tokens=${maxTokens} — retrying alone at max_tokens=${nextMaxTokens}.`);
    return extractBatchWithRecovery(anthropic, pageBatch, usageTracker, nextMaxTokens);
  }
}

// pdfBytes: raw bytes of a multi-page (or single-page) PDF.
// pageIndices: optional — a subset of 0-based page indices to extract (e.g. a triage candidate
// set). Omit to extract every page. Splitting is always local/free (pdf-lib, no API call); only
// the pages actually selected get sent to Claude, so this is the real cost lever for triage.
// Returns { sheets, usage } — sheets is one extraction object per selected page, in original
// document order; usage is a real accounting of every API call made (including retries/splits).
export async function extractSheetsFromPdf(pdfBytes, { pageIndices, maxPagesPerBatch = 6, maxBytesPerBatch = 25 * 1024 * 1024 } = {}) {
  const allPages = await splitPdfIntoPages(pdfBytes);
  const indexed = allPages.map((bytes, index) => ({ index, bytes }));
  const selected = pageIndices ? indexed.filter((p) => pageIndices.includes(p.index)) : indexed;

  const batches = batchPages(selected, { maxPagesPerBatch, maxBytesPerBatch });
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const usageTracker = createUsageTracker();

  const results = [];
  for (const batch of batches) {
    const parsed = await extractBatchWithRecovery(anthropic, batch, usageTracker);
    results.push(...parsed);
  }
  return { sheets: applyExtractionGuards(results), usage: usageTracker.summary() };
}
