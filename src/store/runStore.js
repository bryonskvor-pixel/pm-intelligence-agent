// Run-state persistence for the stage-based pipeline (web deployment step 1). Two
// implementations of one interface: d1RunStore (real runs — the run survives across separate
// short-lived Vercel invocations) and memoryRunStore (free deterministic tests, no network).
//
// Rows stay small on purpose: one row per extracted sheet, one per brand specialist. The big
// values (manifest with the index sheet's rawText, the final report) are single TEXT columns
// guarded by MAX_VALUE_BYTES — the D1 REST call carries the whole statement as one JSON body,
// so a value that grows past roughly a megabyte would start failing at the transport layer.
// The guard fails loudly BEFORE the write rather than letting D1/the API truncate or reject
// with something less legible. If a real run ever trips it, the fallback is moving that value
// to R2 with a pointer here — deliberately not built until needed.
import { d1Query } from '../lib/cloudflare.js';

const MAX_VALUE_BYTES = 750_000;

export const RUN_STATUSES = [
  'created',
  'planning',
  'awaiting_confirmation',
  'confirmed',
  'extracting',
  'synthesizing',
  'complete',
  'failed',
];

function guardValue(label, str) {
  if (str == null) return str;
  const bytes = Buffer.byteLength(str, 'utf8');
  if (bytes > MAX_VALUE_BYTES) {
    throw new Error(
      `${label} is ${bytes.toLocaleString()} bytes — over the ${MAX_VALUE_BYTES.toLocaleString()}-byte D1 value guard. ` +
        'Do not raise the guard blindly: move this value to R2 with a pointer in D1 instead.'
    );
  }
  return str;
}

function toJson(label, value) {
  return value == null ? null : guardValue(label, JSON.stringify(value));
}

function fromJson(str) {
  return str == null ? null : JSON.parse(str);
}

function nowIso() {
  return new Date().toISOString();
}

// Fields callers may update on a run row (JS name -> column). Everything else is set at create.
const RUN_UPDATABLE = {
  status: { column: 'status', json: false },
  manifest: { column: 'manifest_json', json: true },
  confirmedManifest: { column: 'confirmed_manifest_json', json: true },
  report: { column: 'report_json', json: true },
  reportMarkdown: { column: 'report_markdown', json: false },
  usage: { column: 'usage_json', json: true },
  error: { column: 'error', json: false },
};

function rowToRun(row) {
  if (!row) return null;
  return {
    runId: row.run_id,
    status: row.status,
    pdfSource: row.pdf_source,
    indexPageIndex: row.index_page_index,
    manifest: fromJson(row.manifest_json),
    confirmedManifest: fromJson(row.confirmed_manifest_json),
    report: fromJson(row.report_json),
    reportMarkdown: row.report_markdown ?? null,
    usage: fromJson(row.usage_json),
    error: row.error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function d1RunStore({ databaseId }) {
  if (!databaseId) throw new Error('d1RunStore requires the pm-intel-knowledge database id.');

  return {
    async createRun({ runId, pdfSource = null, indexPageIndex = 0 }) {
      const ts = nowIso();
      await d1Query(
        databaseId,
        `INSERT INTO runs (run_id, status, pdf_source, index_page_index, created_at, updated_at)
         VALUES (?, 'created', ?, ?, ?, ?)`,
        [runId, pdfSource, indexPageIndex, ts, ts]
      );
      return this.getRun(runId);
    },

    async getRun(runId) {
      const rows = await d1Query(databaseId, `SELECT * FROM runs WHERE run_id = ?`, [runId]);
      return rowToRun(rows[0]);
    },

    async updateRun(runId, fields) {
      const sets = [];
      const params = [];
      for (const [name, value] of Object.entries(fields)) {
        const spec = RUN_UPDATABLE[name];
        if (!spec) throw new Error(`updateRun: "${name}" is not an updatable run field.`);
        sets.push(`${spec.column} = ?`);
        params.push(spec.json ? toJson(`runs.${spec.column}`, value) : guardValue(`runs.${spec.column}`, value));
      }
      sets.push('updated_at = ?');
      params.push(nowIso(), runId);
      await d1Query(databaseId, `UPDATE runs SET ${sets.join(', ')} WHERE run_id = ?`, params);
    },

    async putSheet(runId, pageIndex, sheet) {
      await d1Query(
        databaseId,
        `INSERT OR REPLACE INTO run_sheets (run_id, page_index, sheet_number, sheet_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [runId, pageIndex, sheet.sheetNumber ?? null, toJson('run_sheets.sheet_json', sheet), nowIso()]
      );
    },

    async listSheets(runId) {
      const rows = await d1Query(
        databaseId,
        `SELECT page_index, sheet_json FROM run_sheets WHERE run_id = ? ORDER BY page_index`,
        [runId]
      );
      return rows.map((r) => ({ pageIndex: r.page_index, sheet: fromJson(r.sheet_json) }));
    },

    async seedSpecialists(runId, brands) {
      // One brand per statement: idempotent (a re-run of the seeding step must not clobber an
      // already-completed specialist row) and clear of the D1 REST variable-count limit.
      for (const brand of brands) {
        await d1Query(
          databaseId,
          `INSERT OR IGNORE INTO run_specialists (run_id, brand, status, updated_at)
           VALUES (?, ?, 'pending', ?)`,
          [runId, brand, nowIso()]
        );
      }
    },

    async listSpecialists(runId) {
      const rows = await d1Query(
        databaseId,
        `SELECT brand, status, result_json FROM run_specialists WHERE run_id = ? ORDER BY brand`,
        [runId]
      );
      return rows.map((r) => ({ brand: r.brand, status: r.status, result: fromJson(r.result_json) }));
    },

    async putSpecialistResult(runId, brand, result) {
      await d1Query(
        databaseId,
        `UPDATE run_specialists SET status = 'done', result_json = ?, updated_at = ?
         WHERE run_id = ? AND brand = ?`,
        [toJson('run_specialists.result_json', result), nowIso(), runId, brand]
      );
    },
  };
}

// Same interface, no network. JSON round-trips deliberately (stringify/parse, with the same size
// guard) so a value that would break the D1 store — non-serializable, oversized — breaks the
// free tests the same way instead of only failing live.
export function memoryRunStore() {
  const runs = new Map();
  const sheets = new Map(); // runId -> Map(pageIndex -> json string)
  const specialists = new Map(); // runId -> Map(brand -> {status, resultJson})

  return {
    async createRun({ runId, pdfSource = null, indexPageIndex = 0 }) {
      const ts = nowIso();
      runs.set(runId, {
        run_id: runId,
        status: 'created',
        pdf_source: pdfSource,
        index_page_index: indexPageIndex,
        manifest_json: null,
        confirmed_manifest_json: null,
        report_json: null,
        report_markdown: null,
        usage_json: null,
        error: null,
        created_at: ts,
        updated_at: ts,
      });
      return this.getRun(runId);
    },

    async getRun(runId) {
      return rowToRun(runs.get(runId));
    },

    async updateRun(runId, fields) {
      const row = runs.get(runId);
      if (!row) throw new Error(`updateRun: no run ${runId}`);
      for (const [name, value] of Object.entries(fields)) {
        const spec = RUN_UPDATABLE[name];
        if (!spec) throw new Error(`updateRun: "${name}" is not an updatable run field.`);
        row[spec.column] = spec.json
          ? toJson(`runs.${spec.column}`, value)
          : guardValue(`runs.${spec.column}`, value);
      }
      row.updated_at = nowIso();
    },

    async putSheet(runId, pageIndex, sheet) {
      if (!sheets.has(runId)) sheets.set(runId, new Map());
      sheets.get(runId).set(pageIndex, toJson('run_sheets.sheet_json', sheet));
    },

    async listSheets(runId) {
      return [...(sheets.get(runId) || new Map()).entries()]
        .sort(([a], [b]) => a - b)
        .map(([pageIndex, json]) => ({ pageIndex, sheet: fromJson(json) }));
    },

    async seedSpecialists(runId, brands) {
      if (!specialists.has(runId)) specialists.set(runId, new Map());
      const map = specialists.get(runId);
      for (const brand of brands) {
        if (!map.has(brand)) map.set(brand, { status: 'pending', resultJson: null });
      }
    },

    async listSpecialists(runId) {
      return [...(specialists.get(runId) || new Map()).entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([brand, s]) => ({ brand, status: s.status, result: fromJson(s.resultJson) }));
    },

    async putSpecialistResult(runId, brand, result) {
      const map = specialists.get(runId);
      const row = map?.get(brand);
      if (!row) throw new Error(`putSpecialistResult: specialist ${brand} was never seeded for run ${runId}`);
      row.status = 'done';
      row.resultJson = toJson('run_specialists.result_json', result);
    },
  };
}
