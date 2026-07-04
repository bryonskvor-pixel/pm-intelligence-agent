import { runProjectSynthesis } from './report.js';

const PROJECT_SHEETS = [
  {
    sheetNumber: 'A-405',
    revision: '1',
    text: `Level 2 ballroom divider wall, gridline D-4 to D-9.
Operable wall: Skyfold Classic 60, 24'-0" long x 14'-1" high, standard drive system.
Support steel shown as W8x10 continuous beam spanning the full 24'-0", by structural engineer of record.
Electrical drawing E-104 shows panel EP-4 feeding this area at 480V, 3-phase.`,
  },
  {
    sheetNumber: 'A-406',
    revision: '0',
    text: `RCP for the Level 2 ballroom, gridline D-4 to D-9, same divider wall as A-405 (Skyfold Classic 60).
Above the ceiling in the same zone: Airolite T6636 relief louver L-12 in the plenum, opening 60 in. wide x 24 in. tall, positioned directly in the panel travel path along the pocket wall's upper stack zone.`,
  },
  {
    sheetNumber: 'A-601',
    revision: '2',
    text: `Mechanical louver schedule, exterior wall gridline B-7, weather-exposed intake location.
Louver L-3: Airolite AC153, opening 96 in. wide x 60 in. tall, single section shown, no mullion or reinforcing member detailed.`,
  },
  {
    sheetNumber: 'A-210',
    revision: '3',
    text: `Corridor smoke curtain schedule, gridline F-2.
Smoke Guard M2100 vertical deployable curtain, header clearance 6 in., FACP loop referenced as "by others" with no auxiliary contact shown on E-series drawings.`,
  },
  {
    sheetNumber: 'S-201',
    revision: '0',
    text: `Structural framing plan, Level 2 ballroom, gridline D-4 to D-9.
W8x10 continuous beam spanning 24'-0", designed for uniform live load only; no concentrated point-load allowance noted at the operable wall location. Deflection criteria: L/240. No proprietary products named on this sheet.`,
  },
  {
    sheetNumber: 'G-001',
    revision: '0',
    text: `General notes and sheet index. No product-specific information on this sheet.`,
  },
];

async function main() {
  console.log(`Running project synthesis on ${PROJECT_SHEETS.length} sheets...\n`);
  const report = await runProjectSynthesis(PROJECT_SHEETS);

  console.log('--- ROUTING ---');
  console.log('Unclassified sheets:', report.unclassifiedSheets);
  console.log('Cross-brand sheets:', report.crossBrandWatch.map((c) => ({ sheetNumber: c.sheetNumber, brands: c.brands })));

  console.log('\n--- BRAND APPENDIX ---');
  for (const b of report.brandAppendix) {
    console.log(`${b.brand}: primary [${b.primarySheets.join(', ')}] context [${b.contextSheets.join(', ')}] — ${b.findings.length} findings`);
  }

  console.log('\n--- SIX-SECTION REPORT ---');
  for (const section of report.sections) {
    console.log(`\n## ${section.title} (${section.findings.length})`);
    for (const f of section.findings) {
      console.log(`- [${f.brand} / ${f.sheet_reference}] ${f.description}`);
      console.log(`  citation: ${f.citation}`);
      if (f.consequence) console.log(`  consequence: ${f.consequence}`);
    }
  }

  console.log('\n--- CROSS-BRAND WATCH ---');
  for (const c of report.crossBrandWatch) {
    console.log(`\nSheet ${c.sheetNumber} (${c.brands.join(' + ')}): ${c.findings.length} co-located findings`);
    for (const f of c.findings) {
      console.log(`- [${f.brand}] ${f.description}`);
    }
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
