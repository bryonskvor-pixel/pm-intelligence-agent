import fs from 'fs';
import { renderReportMarkdown } from './renderMarkdown.js';
import { sumUsageStages, estimateCostUSD } from '../lib/extraction.js';

// Hand-built mock matching the real runProjectSynthesis()/runPipelineFromPdf() schema — this is
// a pure formatting test, no LLM call needed, so a mock exercising every code path (multiple
// findings, cross-brand watch, brand appendix, unclassified sheets, diagnostics) is as valid as
// real output and costs nothing.
const mockReport = {
  sections: [
    {
      key: 'estimating_flag',
      title: 'Estimating Flags',
      findings: [
        {
          brand: 'Skyfold',
          sheet_reference: 'A-405',
          description: 'Structural steel member undersized relative to span: W8x10 beam specified for 24\'-0 in. span.',
          citation: "D1 parameter 'deflection_live_load_standard' = 0.5 in. (Skyfold Classic Spec Sheet Section 10-22-39)",
          consequence: 'Excessive beam deflection causes trolley track misalignment; 3-6 week rework delay.',
        },
      ],
    },
    { key: 'critical_path', title: 'Critical Path / Lag', findings: [] },
    {
      key: 'risk',
      title: 'Risk Register',
      findings: [
        {
          brand: 'Airolite',
          sheet_reference: 'A-406',
          description: 'Airolite T6636 relief louver positioned directly in the Skyfold panel travel path.',
          citation: 'D1 source_doc: Airolite T6636 Spec Sheet Apr 2022',
          consequence: 'Panel collision on retraction; louver relocation required before either trade fabricates.',
        },
      ],
    },
    { key: 'preconstruction_checklist', title: 'Preconstruction Checklist', findings: [] },
    { key: 'measure_day_checklist', title: 'Measure Day Checklist', findings: [] },
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
  brandAppendix: [
    { brand: 'Skyfold', sheetsUsed: ['A-405', 'A-406'], modelIdsDetected: ['SKYFOLD-CLASSIC-60', 'SKYFOLD-GENERAL'], findings: [{}] },
    { brand: 'Airolite', sheetsUsed: ['A-406'], modelIdsDetected: ['T6636', 'AIROLITE-GENERAL'], findings: [{}] },
  ],
  unclassifiedSheets: ['G-001'],
  // Exercises the duplicate-sheet-number warning path (a real defect found this session).
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
    unresolvedCandidates: [],
  },
  orderingMismatches: [],
  gapCheck: { gaps: [], excludedNonSheetReferences: 3 },
  usageTotals,
};

const md = renderReportMarkdown(mockReport, {
  projectName: 'Bryant & Stratton Parma OH (sample)',
  generatedAt: new Date(2026, 6, 2).toDateString(),
  diagnostics: mockDiagnostics,
});

fs.writeFileSync('sample_report.md', md);
console.log(md);
console.log('\n\nWritten to sample_report.md');
