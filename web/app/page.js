'use client';

// The single-page flow that drives the pipeline API: upload a bid-set PDF straight to R2, plan it,
// let the PM edit and confirm the per-brand candidate manifest (the confirmation gate), then step
// the run to completion while polling progress, and finally render the report. State is a small
// explicit machine: idle -> uploading -> planning -> review -> running -> complete (or error).
import { useState, useRef, useCallback } from 'react';
import { marked } from 'marked';

const box = { border: '1px solid #ccc', borderRadius: 6, padding: '1rem', marginTop: '1rem' };
const btn = { padding: '0.5rem 1rem', cursor: 'pointer' };

export default function Home() {
  const [phase, setPhase] = useState('idle'); // idle | uploading | planning | review | running | complete | error
  const [error, setError] = useState(null);
  const [runId, setRunId] = useState(null);
  const [candidates, setCandidates] = useState({}); // brand -> comma-separated string (editable)
  const [reasoning, setReasoning] = useState({});
  const [unresolved, setUnresolved] = useState([]);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState({ sheetsExtracted: 0, specialists: [] });
  const [reportHtml, setReportHtml] = useState(null);
  const [reportMd, setReportMd] = useState(null);
  const fileRef = useRef(null);

  const addLog = useCallback((line) => setLog((l) => [...l, line]), []);

  function fail(message) {
    setError(message);
    setPhase('error');
  }

  async function jsonOrThrow(res) {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  async function handleAnalyze() {
    const file = fileRef.current?.files?.[0];
    if (!file) return fail('Choose a PDF first.');
    setError(null);
    setLog([]);
    try {
      // 1. Get a presigned URL and upload the bytes straight to R2 (bypasses the Vercel body cap).
      setPhase('uploading');
      addLog(`Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);
      const { url, pdfSource } = await jsonOrThrow(
        await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name }),
        })
      );
      const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file });
      if (!put.ok) throw new Error(`R2 upload failed (${put.status})`);

      // 2. Create + plan the run — returns the editable manifest.
      setPhase('planning');
      addLog('Reading the index sheet and triaging brands (this is one short model call)...');
      const plan = await jsonOrThrow(
        await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfSource }),
        })
      );
      setRunId(plan.runId);
      setCandidates(Object.fromEntries(Object.entries(plan.perBrandCandidates).map(([b, list]) => [b, list.join(', ')])));
      setReasoning(plan.perBrandReasoning || {});
      setUnresolved(plan.unresolvedCandidates || []);
      setPhase('review');
    } catch (err) {
      fail(err.message);
    }
  }

  function parseList(str) {
    return str.split(',').map((s) => s.trim()).filter(Boolean);
  }

  async function handleConfirm() {
    try {
      const perBrandCandidates = Object.fromEntries(Object.entries(candidates).map(([b, str]) => [b, parseList(str)]));
      await jsonOrThrow(
        await fetch(`/api/runs/${runId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ perBrandCandidates }),
        })
      );
      setPhase('running');
      addLog('Manifest confirmed. Extracting candidate pages, then running specialists...');
      await runToCompletion();
    } catch (err) {
      fail(err.message);
    }
  }

  // Step the run one stage at a time until there's nothing left to advance automatically. Each
  // /step is one paid stage call; between calls we refresh status so progress is visible live.
  async function runToCompletion() {
    for (let guard = 0; guard < 500; guard += 1) {
      const step = await jsonOrThrow(await fetch(`/api/runs/${runId}/step`, { method: 'POST' }));
      if (step.phase === 'extract') {
        addLog(step.detail.done ? `Extraction complete — specialists: ${step.detail.firingBrands.join(', ')}` : `Extracted pages ${step.detail.extractedPages.join(', ')} (${step.detail.remainingPages} left)`);
      } else if (step.phase === 'specialist') {
        addLog(`Specialist ${step.detail.brand} finished.`);
      } else if (step.phase === 'finalize') {
        addLog('Reconciling findings and rendering the report...');
      }
      await refreshStatus();
      if (!step.more) break;
    }
    // Pull the finished report.
    const status = await jsonOrThrow(await fetch(`/api/runs/${runId}`));
    if (status.status === 'complete' && status.reportMarkdown) {
      setReportMd(status.reportMarkdown);
      setReportHtml(marked.parse(status.reportMarkdown));
      setPhase('complete');
    } else if (status.error) {
      fail(status.error);
    } else {
      fail(`Run stopped at status "${status.status}" without a report.`);
    }
  }

  async function refreshStatus() {
    try {
      const s = await jsonOrThrow(await fetch(`/api/runs/${runId}`));
      setProgress({ sheetsExtracted: s.sheetsExtracted, specialists: s.specialists || [] });
    } catch {
      /* non-fatal: the next step call will surface any real problem */
    }
  }

  function downloadReport() {
    const blob = new Blob([reportMd], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `report-${runId}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function reset() {
    setPhase('idle');
    setError(null);
    setRunId(null);
    setCandidates({});
    setLog([]);
    setProgress({ sheetsExtracted: 0, specialists: [] });
    setReportHtml(null);
    setReportMd(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const busy = phase === 'uploading' || phase === 'planning' || phase === 'running';

  return (
    <main style={{ maxWidth: 820 }}>
      <h1>PM Intelligence Agent</h1>

      {phase === 'idle' && (
        <div style={box}>
          <p>Upload a bid-set PDF to generate the bid qualification package.</p>
          <input ref={fileRef} type="file" accept="application/pdf" />
          <div style={{ marginTop: '0.75rem' }}>
            <button style={btn} onClick={handleAnalyze}>Analyze</button>
          </div>
        </div>
      )}

      {(phase === 'uploading' || phase === 'planning') && (
        <div style={box}>
          <p>{phase === 'uploading' ? 'Uploading…' : 'Planning — reading the index sheet…'}</p>
          <LogView log={log} />
        </div>
      )}

      {phase === 'review' && (
        <div style={box}>
          <h2 style={{ marginTop: 0 }}>Confirm the sheet manifest</h2>
          <p style={{ color: '#555' }}>
            Each brand&apos;s candidate sheets were triaged from the index. Edit the comma-separated lists
            (add a structural/electrical sheet a specialist should see, or remove noise), then confirm.
            This is the only gate before paid page extraction.
          </p>
          {Object.entries(candidates).map(([brand, str]) => (
            <div key={brand} style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontWeight: 600 }}>{brand}</label>
              {reasoning[brand] && <div style={{ fontSize: 12, color: '#777' }}>{reasoning[brand]}</div>}
              <input
                value={str}
                onChange={(e) => setCandidates((c) => ({ ...c, [brand]: e.target.value }))}
                style={{ display: 'block', width: '100%', padding: '0.4rem', marginTop: 2 }}
                placeholder="(no candidate sheets — leave empty to skip this brand)"
              />
            </div>
          ))}
          {unresolved.length > 0 && (
            <p style={{ fontSize: 13, color: '#a60' }}>
              Unresolved candidates (will surface in the report&apos;s Unresolved Items): {unresolved.join(', ')}
            </p>
          )}
          <button style={btn} onClick={handleConfirm}>Confirm &amp; run</button>{' '}
          <button style={{ ...btn, background: 'none', border: '1px solid #ccc' }} onClick={reset}>Cancel</button>
        </div>
      )}

      {phase === 'running' && (
        <div style={box}>
          <h2 style={{ marginTop: 0 }}>Running…</h2>
          <p>Sheets extracted: {progress.sheetsExtracted}</p>
          {progress.specialists.length > 0 && (
            <ul>
              {progress.specialists.map((s) => (
                <li key={s.brand}>{s.brand}: {s.status}</li>
              ))}
            </ul>
          )}
          <LogView log={log} />
          <p style={{ fontSize: 12, color: '#999' }}>Keep this tab open — the run advances one stage per request.</p>
        </div>
      )}

      {phase === 'complete' && (
        <div style={box}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Report</h2>
            <div>
              <button style={btn} onClick={downloadReport}>Download .md</button>{' '}
              <button style={{ ...btn, background: 'none', border: '1px solid #ccc' }} onClick={reset}>New run</button>
            </div>
          </div>
          <article
            style={{ marginTop: '1rem', lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: reportHtml }}
          />
        </div>
      )}

      {phase === 'error' && (
        <div style={{ ...box, borderColor: 'crimson' }}>
          <p style={{ color: 'crimson' }}>Error: {error}</p>
          {log.length > 0 && <LogView log={log} />}
          <button style={btn} onClick={reset}>Start over</button>
        </div>
      )}

      {busy && <p style={{ color: '#999', fontSize: 13 }}>Working…</p>}
    </main>
  );
}

function LogView({ log }) {
  if (!log.length) return null;
  return (
    <pre style={{ background: '#f6f6f6', padding: '0.75rem', borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>
      {log.join('\n')}
    </pre>
  );
}
