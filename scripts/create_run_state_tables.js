// Web deployment step 1: run-state tables in pm-intel-knowledge. A "run" is one PDF through the
// plan → confirm → extract → specialists → finalize pipeline, broken into short calls (Vercel
// one-agent-per-call) that each read/write these rows instead of holding state in memory.
//
// One row per sheet (run_sheets) and per brand (run_specialists) — not one big JSON blob — so
// every D1 write stays small and a mid-run failure resumes from what's already persisted instead
// of re-paying for extraction/specialist calls.
//
// Idempotent: CREATE TABLE IF NOT EXISTS only; never drops or reseeds (runs are real paid work,
// not reference data — unlike create_required_conditions.js this must NOT delete on re-run).
//
// Run: node --env-file=.cloudflare.env scripts/create_run_state_tables.js
import { d1Query } from '../src/lib/cloudflare.js';

const KNOWLEDGE_DB_ID = '305c2b6e-3c25-4ac1-b9f6-39ad23422c8d';

const statements = [
  `CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    pdf_source TEXT,
    index_page_index INTEGER,
    manifest_json TEXT,
    confirmed_manifest_json TEXT,
    report_json TEXT,
    report_markdown TEXT,
    usage_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS run_sheets (
    run_id TEXT NOT NULL,
    page_index INTEGER NOT NULL,
    sheet_number TEXT,
    sheet_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (run_id, page_index)
  )`,
  `CREATE TABLE IF NOT EXISTS run_specialists (
    run_id TEXT NOT NULL,
    brand TEXT NOT NULL,
    status TEXT NOT NULL,
    result_json TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (run_id, brand)
  )`,
];

for (const sql of statements) {
  await d1Query(KNOWLEDGE_DB_ID, sql);
}
const tables = await d1Query(
  KNOWLEDGE_DB_ID,
  `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('runs','run_sheets','run_specialists') ORDER BY name`
);
console.log('Run-state tables present:', tables.map((t) => t.name).join(', '));
