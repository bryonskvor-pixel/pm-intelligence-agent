import fs from 'fs';
import assert from 'node:assert/strict';
import { renderReportMarkdown } from './renderMarkdown.js';
import { REPORT_SECTIONS } from '../synthesis/report.js';
import { sumUsageStages, estimateCostUSD } from '../lib/extraction.js';

// Hand-built mock matching the real runProjectSynthesis()/runPipelineFromPdf() schema — this is
// a pure formatting test, no LLM call needed, so a mock exercising every code path (bid
// qualification package sections, RFI ordering/numbering, reconciliation annotations, appendix
// sections, diagnostics) is as valid as real output and costs nothing.
//
// Phase 4 acceptance lives here too: the rendered markdown must OPEN with sections 1-6 in the
// work order's order, and gapCheck gaps must appear in Unresolved Items, not only in diagnostics.

const mockReport = {
  sections: [
    {
      key: 'whats_not_shown',
      title: "What the Drawings Don't Show",
      findings: [
        {
          brand: 'Skyfold',
          sheet_reference: 'ABSENT',
          finding_type: 'estimating_flag',
          evidence_type: 'ABSENCE',
          description: 'Required condition not found on any provided sheet: dedicated 3-phase power circuit for the drive motor shown on electrical sheets.',
          citation: 'required_conditions: SKYFOLD-GENERAL — "3-phase power circuit shown on E sheets"',
          consequence: 'Unpriced electrical scope; commissioning delay.',
          escalated: true,
        },
      ],
    },
    {
      key: 'rfi_list',
      title: 'RFI List (before pricing)',
      // Report object carries these bid-gating first; the renderer numbers them RFI-01, RFI-02...
      rfis: [
        {
          source: 'reconciler',
          source_finding_id: 'F6',
          brand: 'Skyfold',
          rfi_subject: 'Electrical circuit for Skyfold drive motor not shown',
          references: ['E-series (absent)', 'A-405'],
          question: 'Which panel and circuit will feed the Skyfold drive motor, and on which electrical sheet will it be shown?',
          bid_impact: 'Electrical rough-in scope cannot be priced; proposal must exclude drive-motor power until answered.',
          bid_gating: true,
          evidence_type: 'ABSENCE',
          source_citation: 'required_conditions: SKYFOLD-GENERAL',
        },
        {
          source: 'specialist',
          source_finding_id: 'F2',
          brand: 'Modernfold',
          rfi_subject: 'Confirm finish schedule reference for operable partition panels',
          references: ['A-601'],
          question: 'Which finish schedule entry applies to the operable partition panels on A-601?',
          bid_impact: 'Housekeeping — finish allowance carried either way.',
          bid_gating: false,
          evidence_type: 'TEXT_READ',
          source_citation: 'Sheet A-601 finish schedule',
        },
      ],
    },
    {
      key: 'qualification',
      title: 'Proposal Qualifications',
      findings: [
        {
          brand: 'Skyfold',
          sheet_reference: 'S-201',
          finding_type: 'qualification',
          evidence_type: 'TEXT_READ',
          description: 'Proposal assumes overhead structural support for the Skyfold unit is designed and provided by others per S-201.',
          citation: 'Sheet S-201 framing plan; Skyfold structural support requirements (D1: SKYFOLD-GENERAL)',
        },
      ],
    },
    {
      key: 'field_verification',
      title: 'Field Verification List',
      findings: [
        {
          brand: 'Euro-Wall',
          sheet_reference: 'A-501',
          finding_type: 'measure_day_checklist',
          evidence_type: 'GEOMETRY_INFERRED',
          demoted_from: 'estimating_flag',
          description: 'Sill recess depth relative to finished floor appears inconsistent between plan and section — verify in field.',
          citation: 'Sheet A-501 details',
        },
      ],
    },
    {
      key: 'risk_register',
      title: 'Risk Register',
      findings: [
        {
          brand: 'Airolite',
          sheet_reference: 'A-406',
          finding_type: 'risk',
          evidence_type: 'TEXT_READ',
          description: 'Airolite T6636 relief louver positioned directly in the Skyfold panel travel path.',
          citation: 'D1 source_doc: Airolite T6636 Spec Sheet Apr 2022',
          consequence: 'Panel collision on retraction; louver relocation required before either trade fabricates.',
          corroborated_by: [
            {
              id: 'F9',
              brand: 'Skyfold',
              sheet_reference: 'A-406',
              citation: 'Sheet A-406 RCP',
              description: 'Louver L-12 drawn within the vertical travel path of the Skyfold panel stack.',
            },
          ],
        },
      ],
      contradictions: [
        {
          finding_ids: ['F1', 'F3'],
          sheets: ['A-405', 'S-201'],
          description: 'A-405 states deflection criteria of L/360 for the divider support header; S-201 states L/240 for the same beam.',
          citation: 'Sheet A-405 general notes; Sheet S-201 framing plan notes',
        },
      ],
      crossBrandWatch: [
        {
          sheetNumber: 'A-406',
          brands: ['Skyfold', 'Airolite'],
          findings: [
            { brand: 'Skyfold', description: 'Plenum obstruction in panel travel path.' },
            { brand: 'Airolite', description: 'Louver positioned in adjacent operable wall travel path.' },
          ],
        },
      ],
    },
    {
      key: 'unresolved',
      title: 'Unresolved Items',
      unresolved: {
        // The Phase 4 acceptance case: a gapCheck gap promoted out of the diagnostics appendix.
        gapCheckGaps: [{ targetSheet: 'S-501', referencedBy: [{ fromSheet: 'S-201' }, { fromSheet: 'A-405' }] }],
        unresolvedTriageCandidates: ['FA-101'],
        orderingMismatches: [{ pageIndex: 12, expected: 'A-407', actual: 'A-408' }],
        escalations: [
          {
            finding_id: 'F6',
            finding: {
              brand: 'Skyfold',
              description: 'Required condition not found on any provided sheet: dedicated 3-phase power circuit for the drive motor shown on electrical sheets.',
              citation: 'required_conditions: SKYFOLD-GENERAL',
            },
            missing_sheet_types: ['electrical (E) sheets'],
            rationale: 'No E-series sheet exists in the extracted set at all.',
          },
        ],
      },
    },
    {
      key: 'estimating_flag',
      title: 'Estimating Flags',
      findings: [
        {
          brand: 'Skyfold',
          sheet_reference: 'A-405',
          finding_type: 'estimating_flag',
          evidence_type: 'TEXT_READ',
          description: 'Structural steel member undersized relative to span: W8x10 beam specified for 24\'-0 in. span.',
          citation: "D1 parameter 'deflection_live_load_standard' = 0.5 in. (Skyfold Classic Spec Sheet Section 10-22-39)",
          consequence: 'Excessive beam deflection causes trolley track misalignment; 3-6 week rework delay.',
          derived_value_flag: { value: '1.2 in.', reason: 'L/-ratio converted to inches at the drawn span — model arithmetic, not a quoted value.' },
        },
      ],
    },
    { key: 'critical_path', title: 'Critical Path / Lag', findings: [] },
  ],
  appendixSections: [
    {
      key: 'preconstruction_checklist',
      title: 'Preconstruction Checklist',
      findings: [
        {
          brand: 'Smoke Guard',
          sheet_reference: 'A-210',
          finding_type: 'preconstruction_checklist',
          evidence_type: 'TEXT_READ',
          description: 'Confirm AHJ-required deploy-delay timing before ordering — order-time-only controller setting.',
          citation: 'Smoke Guard controller documentation (D1: SG-CONTROLLER)',
        },
      ],
    },
    { key: 'installation_briefing', title: 'Installation Briefing', findings: [] },
  ],
  crossBrandWatch: [
    {
      sheetNumber: 'A-406',
      brands: ['Skyfold', 'Airolite'],
      findings: [
        { brand: 'Skyfold', description: 'Plenum obstruction in panel travel path.' },
        { brand: 'Airolite', description: 'Louver positioned in adjacent operable wall travel path.' },
      ],
    },
  ],
  reconciliation: {
    contradictions: [], corroborations: [], escalations: [], culled: [], derivedValueFlags: [], rfis: [], warnings: [],
  },
  brandAppendix: [
    {
      brand: 'Skyfold',
      sheetsUsed: ['A-405', 'A-406'],
      primarySheets: ['A-405', 'A-406'],
      contextSheets: ['S-201', 'G-001'],
      modelIdsDetected: ['SKYFOLD-CLASSIC-60', 'SKYFOLD-GENERAL'],
      findings: [
        { finding_type: 'estimating_flag', evidence_type: 'TEXT_READ', sheet_reference: 'A-405', description: 'Structural steel member undersized relative to span.' },
        { finding_type: 'estimating_flag', evidence_type: 'ABSENCE', sheet_reference: 'ABSENT', description: 'Dedicated 3-phase power circuit not shown on any provided sheet.' },
      ],
    },
    {
      brand: 'Airolite',
      sheetsUsed: ['A-406'],
      primarySheets: ['A-406'],
      contextSheets: ['S-201', 'G-001'],
      modelIdsDetected: ['T6636', 'AIROLITE-GENERAL'],
      findings: [
        { finding_type: 'risk', evidence_type: 'TEXT_READ', sheet_reference: 'A-406', description: 'Relief louver in the operable wall travel path.' },
      ],
    },
  ],
  unclassifiedSheets: ['G-001'],
  // Exercises the duplicate-sheet-number warning path (a real defect found in production data).
  duplicateSheetNumbers: ['A-102'],
};

const usageStages = {
  index: { callCount: 1, inputTokens: 4200, outputTokens: 1800, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
  triage: { callCount: 1, inputTokens: 3899, outputTokens: 1133, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
  extraction: { callCount: 4, inputTokens: 18000, outputTokens: 14000, cacheCreationInputTokens: 900, cacheReadInputTokens: 0 },
};
const usageTotals = { ...sumUsageStages(usageStages), estimatedCostUSD: estimateCostUSD(sumUsageStages(usageStages)) };

const mockDiagnostics = {
  pagesExtracted: [0, 4, 17, 18],
  triage: {
    perBrand: {
      Skyfold: { candidateSheetNumbers: ['A-405', 'A-406'], reasoning: 'RCP and structural sheets for plenum/steel.' },
      Airolite: { candidateSheetNumbers: ['A-406'], reasoning: 'Louver near the same zone.' },
    },
    unresolvedCandidates: ['FA-101'],
  },
  orderingMismatches: [],
  gapCheck: { gaps: [{ targetSheet: 'S-501', referencedBy: [{ fromSheet: 'S-201' }, { fromSheet: 'A-405' }] }], excludedNonSheetReferences: 3 },
  usageTotals,
};

const md = renderReportMarkdown(mockReport, {
  projectName: 'Bryant & Stratton Parma OH (sample)',
  generatedAt: new Date(2026, 6, 2).toDateString(),
  diagnostics: mockDiagnostics,
});

fs.writeFileSync('sample_report.md', md);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// --- Phase 4 acceptance: the report OPENS with sections 1-6 in the work order's order. ---
const REQUIRED_OPENING = [
  "What the Drawings Don't Show",
  'RFI List (before pricing)',
  'Proposal Qualifications',
  'Field Verification List',
  'Risk Register',
  'Unresolved Items',
];

check('rendered markdown opens with sections 1-6 in the work order order', () => {
  const h2s = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(h2s.slice(0, 6), REQUIRED_OPENING, `first six ## headings were: ${h2s.slice(0, 6).join(' | ')}`);
});

check('REPORT_SECTIONS itself leads with the six package sections (source-of-truth order)', () => {
  assert.deepEqual(REPORT_SECTIONS.slice(0, 6).map((s) => s.title), REQUIRED_OPENING);
});

check('gapCheck gap (S-501) appears in Unresolved Items, not only in diagnostics', () => {
  const unresolvedBody = md.split('## Unresolved Items')[1].split(/^## /m)[0];
  assert.match(unresolvedBody, /S-501/, 'S-501 must render inside the Unresolved Items section');
  assert.match(unresolvedBody, /referenced by S-201, A-405/);
});

check('RFIs are numbered sequentially with the bid-gating item first', () => {
  const rfi1 = md.indexOf('RFI-01');
  const rfi2 = md.indexOf('RFI-02');
  assert.ok(rfi1 !== -1 && rfi2 !== -1 && rfi1 < rfi2, 'RFI-01 and RFI-02 must both render, in order');
  const rfi1Block = md.slice(rfi1, rfi2);
  assert.match(rfi1Block, /\[BID-GATING\]/, 'first-numbered RFI must be the bid-gating one');
  assert.match(rfi1Block, /Which panel and circuit/);
});

check('reconciler contradictions render inside Risk Register', () => {
  const riskBody = md.split('## Risk Register')[1].split(/^## /m)[0];
  assert.match(riskBody, /Contradictions \(reconciler\)/);
  assert.match(riskBody, /L\/360/);
  assert.match(riskBody, /Cross-brand interactions/, 'Cross-Brand Watch content must fold into Risk Register');
});

check('no standalone Cross-Brand Watch section remains', () => {
  assert.ok(!/^## Cross-Brand Watch$/m.test(md));
});

check('escalated finding is marked ESCALATED in What the Drawings Don\'t Show', () => {
  const section1 = md.split("## What the Drawings Don't Show")[1].split(/^## /m)[0];
  assert.match(section1, /\*\*ESCALATED\*\*/);
});

check('brand appendix displays per-finding evidence_type', () => {
  const appendixBody = md.split('## Brand Appendix')[1];
  assert.match(appendixBody, /\[estimating_flag \/ ABSENCE \/ ABSENT\]/);
  assert.match(appendixBody, /\[risk \/ TEXT_READ \/ A-406\]/);
});

check('preconstruction checklist and installation briefing render as appendix sections after the brand appendix', () => {
  const preIdx = md.indexOf('## Appendix: Preconstruction Checklist');
  const instIdx = md.indexOf('## Appendix: Installation Briefing');
  const brandIdx = md.indexOf('## Brand Appendix');
  assert.ok(preIdx > brandIdx && instIdx > preIdx, 'appendix sections must follow the Brand Appendix');
  const h2s = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.ok(!h2s.slice(0, 8).includes('Appendix: Preconstruction Checklist'), 'must not crowd the qualification package');
});

check('derived-value flag and corroboration annotations render on findings', () => {
  assert.match(md, /⚠ Derived-value flag/);
  assert.match(md, /Corroborated by Skyfold \/ A-406/);
});

// --- Required-even-when-empty: Unresolved Items renders its "none" line, never disappears. ---
check('empty Unresolved Items renders the required "None" line', () => {
  const emptyReport = {
    ...mockReport,
    sections: mockReport.sections.map((s) =>
      s.key === 'unresolved'
        ? { ...s, unresolved: { gapCheckGaps: [], unresolvedTriageCandidates: [], orderingMismatches: [], escalations: [] } }
        : s
    ),
  };
  const emptyMd = renderReportMarkdown(emptyReport, { projectName: 'Empty-unresolved sample' });
  const body = emptyMd.split('## Unresolved Items')[1].split(/^## /m)[0];
  assert.match(body, /None — all required conditions accounted for\./);
});

console.log(`\n${passed} render checks passed. Sample written to sample_report.md`);
