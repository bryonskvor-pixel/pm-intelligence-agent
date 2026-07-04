// Phase 2a (Remediation Work Order): create and seed the required_conditions table in
// pm-intel-params. A row = a condition the drawings MUST show for a product to be biddable;
// specialists verify each against the full sheet set and flag every one that appears nowhere
// (Track 2 absence findings). Seeded from the PM Master Playbook and the scar knowledge already
// embedded in the specialist prompts/spec-sheet ingestion.
//
// Idempotent: CREATE TABLE IF NOT EXISTS, then full delete + reseed, so edits to this file can
// be re-run safely. Batched inserts (<=10 rows/statement) per the D1 REST "too many SQL
// variables" limit found during Airolite ingestion.
//
// Run: node --env-file=.cloudflare.env scripts/create_required_conditions.js
import { d1Query } from '../src/lib/cloudflare.js';

const PARAMS_DB_ID = '18812c7c-0661-4e87-beaa-926b18f13a67';

const rows = [];
function add(brand, model_id, condition, where_expected, absence_consequence, source_doc) {
  rows.push([brand, model_id, condition, where_expected, absence_consequence, source_doc]);
}

// ---- Skyfold ----
add('Skyfold', 'SKYFOLD-GENERAL',
  'Overhead structural support explicitly sized for the Skyfold concentrated dead load, with the load treated as present whether the wall is retracted or deployed',
  'Structural framing plans / S-series sheets, structural general notes',
  'Bid assumes support-by-others that was never engineered; steel redesign or reinforcement discovered post-award; wall cannot be hung; schedule slip measured in weeks',
  'PM Master Playbook Sec 2 (Skyfold structural verification); Skyfold Standard Deflection Criteria');
add('Skyfold', 'SKYFOLD-GENERAL',
  'Deflection criteria for the supporting steel stated to the Skyfold standard (0.5 in live load / 1.0 in dead load absolute), not only a generic L/-ratio',
  'Structural general notes / S-series sheets',
  'Beam deflects beyond Skyfold tolerance; wall binds, floor seal fails acoustically; field reinforcement at full rework cost',
  'Skyfold Standard Deflection Criteria; PM Master Playbook Sec 3 (support steel levelness)');
add('Skyfold', 'SKYFOLD-GENERAL',
  'Clear plenum no-fly zone reserved along the full wall footprint and panel travel path (no ducts, conduit, piping, sprinkler mains, or fixtures)',
  'RCPs, M-series and P-series sheets',
  'Obstruction discovered at install; trade relocation cost and delay, or wall cannot retract at all',
  'PM Master Playbook Sec 2 (Skyfold plenum management); Skyfold GC coordination notes');
add('Skyfold', 'SKYFOLD-GENERAL',
  '3-phase power circuit (208V or 480V per model requirement) with disconnect switch location shown on electrical sheets',
  'E-series sheets / panel schedules',
  'No usable power at commissioning, or wrong voltage damages motor and controls; delayed electrical sign-off',
  'PM Master Playbook Sec 2 (Skyfold electrical supply); Skyfold Zenith Premium GC/electrical notes');

// ---- Modernfold ----
add('Modernfold', 'MODERNFOLD-GENERAL',
  'Track support structure detailed for the concentrated load of all panels stacked in the pocket',
  'Structural framing / S-series sheets, header details',
  'Header sags under stacked load; track misaligns, panels bind, bottom seals fail',
  'PM Master Playbook Sec 2 (Modernfold header support)');
add('Modernfold', 'MODERNFOLD-GENERAL',
  'Stacking pocket dimensioned on plan (depth and width shown, not assumed)',
  'Floor plans / enlarged plans / partition details',
  'Pocket cannot hold the calculated stack; panels protrude into the room and pocket doors will not close; framing rework',
  'PM Master Playbook Sec 2-3 (pocket/closet architecture, drywall pocket depth)');
add('Modernfold', 'MODERNFOLD-GENERAL',
  'Floor flatness tolerance stated somewhere in the documents (spec section or general notes)',
  'Specifications / general notes / finish schedules',
  'Bottom drop-down seals fail against an undulating slab; STC rating missed; floor grinding or leveling cost after install',
  'PM Master Playbook Sec 3 (floor levelness / slab crowning); Modernfold spec sheets');
add('Modernfold', 'MODERNFOLD-GENERAL',
  'Stacking pocket footprint clear of electrical devices (no panels, switches, outlets, or thermostats inside the pocket perimeter)',
  'Floor plans + E-series sheets',
  'Device blocks the stack; electrical relocation or pocket redesign discovered at install time',
  'PM Master Playbook Sec 2 (Modernfold pocket architecture); Modernfold spec sheets');
add('Modernfold', 'MODERNFOLD-GENERAL',
  'Acoustic plenum barrier (baffle) indicated directly above the full track line',
  'RCPs / wall types / building sections',
  'Sound flanks over the partition through the open plenum; specified STC never achieved even with a perfect wall; post-occupancy remediation',
  'PM Master Playbook Sec 2 (Modernfold acoustic continuity)');

// ---- Smoke Guard ----
add('Smoke Guard', 'SMOKE-GUARD-GENERAL',
  'FACP auxiliary contact (normally open, supervised) explicitly shown feeding the Smoke Guard controller on the fire alarm documents',
  'FA-series sheets / fire alarm riser diagrams / fire alarm shop drawings',
  'Curtain never receives the alarm signal and will not deploy; failed commissioning, fire alarm rework, occupancy delay',
  'PM Master Playbook Sec 2 (FACP relay integration); Smoke Guard Controller Tech Sheet Rev4');
add('Smoke Guard', 'SMOKE-GUARD-GENERAL',
  'Deploy-delay / egress timing sequence confirmed against the AHJ requirement before ordering (controller timing can only be set at time of order)',
  'Code compliance sheets / fire alarm sequence of operations / specifications',
  'AHJ rejects the timing at inspection; correction requires a hardware reorder, not a field adjustment; Certificate of Occupancy hold-up',
  'Smoke Guard Controller Tech Sheet Rev4 (deploy_delay_option); PM Master Playbook Sec 7 (AHJ alignment)');
add('Smoke Guard', 'SMOKE-GUARD-GENERAL',
  'Dedicated 120V circuit to each curtain controller shown on electrical sheets',
  'E-series sheets / panel schedules',
  'No continuous AC source for the battery-backed controller; system cannot maintain emergency battery configuration; commissioning fails',
  'PM Master Playbook Sec 2-3 (Smoke Guard power continuity, dedicated 120V circuitry); model tech sheets');
add('Smoke Guard', 'SMOKE-GUARD-GENERAL',
  'Curtain travel path and adjacent wall face shown clear of obstructions (sprinkler heads, exit signs, HVAC diffusers, call buttons, elevator frames)',
  'RCPs / interior elevations',
  'Curtain strikes an obstruction on deployment; failed acceptance test; device relocation after finishes are complete',
  'PM Master Playbook Sec 3 (wall face obstructions); Smoke Guard obstruction/clearance guidance');

// ---- Airolite ----
add('Airolite', 'AIROLITE-GENERAL',
  'Airflow/CFM (or free-area) requirement stated on mechanical sheets and reconcilable to the scheduled louver model free area',
  'M-series sheets / louver schedules',
  'Louver starves the air handler, or a field blade change to hit airflow destroys water resistance; mechanical redesign after fabrication',
  'PM Master Playbook Sec 2 (Airolite airflow validation)');
add('Airolite', 'AIROLITE-GENERAL',
  'Water penetration requirement stated for weather-exposed openings and matched to a water-rated louver model',
  'Louver schedules / exterior elevations / specifications',
  'A non-rated louver passes wind-driven rain straight through the envelope; equipment damage, mold, warranty void',
  'Airolite spec sheets (AC153 has no published water rating); PM Master Playbook Sec 1 (Airolite risk profile)');
add('Airolite', 'AIROLITE-GENERAL',
  'Opening sizes checked against the specified model maximum single-section size, with a mullion/reinforcing plan shown for oversize openings',
  'Louver schedules + exterior elevations / details',
  'Single-section louver as drawn is unbuildable; unbudgeted reinforcing steel and section splits surface at fabrication',
  'Airolite spec sheets (max single-section sizes per model); structural responsibility split');
add('Airolite', 'AIROLITE-GENERAL',
  'Substrate and fastener compatibility (galvanic/electrolysis isolation for dissimilar metals) addressed in details or specifications',
  'Wall sections / anchor details / specifications',
  'Galvanic corrosion at anchor points; frame staining or failure; warranty exposure',
  'Airolite Instruction Manual Dec 2009 (electrolysis caution)');
add('Airolite', 'AIROLITE-GENERAL',
  'Perimeter waterproofing / sill pan flashing sequenced before louver anchoring',
  'Wall sections / waterproofing details',
  'Envelope leak path at the louver perimeter discovered after cladding is complete; invasive rework',
  'PM Master Playbook Sec 2 (Airolite waterproofing intersect)');

// ---- Euro-Wall ----
add('Euro-Wall', 'EUROWALL-GENERAL',
  'Pocket framing (or panel stacking bay) detailed for panel storage',
  'Floor plans / enlarged plans / framing details',
  'Panels have nowhere to stack; opening redesign after award — the exact detail most often value-engineered out between drawing sets',
  'Remediation Work Order canonical failure modes; Euro-Wall install guides');
add('Euro-Wall', 'EUROWALL-GENERAL',
  'Sill detail present, including drainage/weep provisions at exterior conditions',
  'Wall sections / sill details / waterproofing sheets',
  'Water intrusion at the sill; flooring damage; sill liner rework is destructive to remove and redo',
  'Euro-Wall install guides (sill pan recommendation); PM Master Playbook Sec 2 (sill integration)');
add('Euro-Wall', 'EUROWALL-GENERAL',
  'Finished-floor relationship dimensioned (track recess depth or flush condition versus finished floor elevation)',
  'Building sections / finish plans / sill details',
  'Track sits proud (trip/ADA issue) or buried (panel binding); concrete rework after slab is placed',
  'PM Master Playbook Sec 2 (Euro-Wall sill integration, engineered recess)');
add('Euro-Wall', 'EUROWALL-GENERAL',
  'Header deflection limit stated for the full glass load (Playbook standard: L/720 under full glass weight)',
  'Structural notes / S-series sheets / header details',
  'Header sags under glass weight; panels pinch and lock up; structural retrofit with glass in place',
  'PM Master Playbook Sec 2 (Euro-Wall header rigidity, L/720)');
add('Euro-Wall', 'EUROWALL-GENERAL',
  'Design-pressure requirement checked against the model DP chart at the actual opening size (headline/brochure DP numbers taper above height thresholds)',
  'Window/door schedules / structural wind-load notes',
  'Unit fails engineering review or fails in service; resubmittal and reorder at the actually-rated configuration',
  'Euro-Wall Vista CT/TL brochures (DP taper); PM Master Playbook Sec 2 (code compliance)');

async function main() {
  await d1Query(
    PARAMS_DB_ID,
    `CREATE TABLE IF NOT EXISTS required_conditions (
      id INTEGER PRIMARY KEY,
      brand TEXT NOT NULL,
      model_id TEXT NOT NULL,
      condition TEXT NOT NULL,
      where_expected TEXT NOT NULL,
      absence_consequence TEXT NOT NULL,
      source_doc TEXT NOT NULL
    )`
  );
  await d1Query(PARAMS_DB_ID, 'DELETE FROM required_conditions');

  const BATCH = 10;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch.map(() => '(?,?,?,?,?,?)').join(',');
    await d1Query(
      PARAMS_DB_ID,
      `INSERT INTO required_conditions (brand, model_id, condition, where_expected, absence_consequence, source_doc) VALUES ${placeholders}`,
      batch.flat()
    );
    console.log(`Inserted rows ${i + 1}-${i + batch.length} of ${rows.length}`);
  }

  const counts = await d1Query(
    PARAMS_DB_ID,
    'SELECT brand, COUNT(*) AS n FROM required_conditions GROUP BY brand ORDER BY brand'
  );
  console.log('\nrequired_conditions row counts by brand:');
  for (const c of counts) console.log(`  ${c.brand}: ${c.n}`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
