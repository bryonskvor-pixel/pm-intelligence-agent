// Phase 2c (Remediation Work Order): post-parse enforcement of the evidence-typing contract.
// Every specialist finding must carry a valid evidence_type, and any GEOMETRY_INFERRED finding
// is automatically demoted to a field-verification item (measure_day_checklist) — a measurement
// the model inferred from drawn geometry is never allowed to stand as a priced/actioned finding.
//
// Philosophy matches the extraction guards (extractionGuards.js): flag, demote, and surface —
// never silently auto-correct content. In particular, a finding whose description violates the
// quantity prohibition is warned about, not rewritten: deterministic rewording would be
// paraphrasing, and paraphrasing away from what the specialist actually cited is the one thing
// this pipeline never does.

export const EVIDENCE_TYPES = [
  'TEXT_READ',
  'SCHEDULE_EXTRACTED',
  'SYMBOL_INTERPRETED',
  'GEOMETRY_INFERRED',
  'CROSS_REFERENCE',
  'ABSENCE',
];

// Heuristic, warning-only: a number followed by a unit inside a GEOMETRY_INFERRED finding
// suggests the prompt's "never state a measurement value" rule was violated. Quoted-verbatim
// values are allowed in other evidence types, so this only runs on GEOMETRY_INFERRED.
const MEASUREMENT_PATTERN = /\b\d+(?:[\s./-]\d+)*\s*(?:in\.?|ft\b|feet|psf\b|lbs?\b|pounds|amps?\b|deg\b|degrees|cfm\b|fpm\b|mm\b|cm\b)/i;

// findings: parsed specialist output. Returns { findings, warnings } — findings with the
// demotion applied, warnings describing every rule the raw output tripped.
export function guardFindings(findings) {
  const warnings = [];
  if (!Array.isArray(findings)) {
    return {
      findings: [],
      warnings: [{ type: 'not_an_array', detail: `Specialist output was ${typeof findings}, expected an array of findings.` }],
    };
  }

  const guarded = findings.map((f, i) => {
    const out = { ...f };

    if (!EVIDENCE_TYPES.includes(out.evidence_type)) {
      warnings.push({
        type: 'invalid_evidence_type',
        detail: `Finding ${i} ("${String(out.description || '').slice(0, 80)}...") has evidence_type ${JSON.stringify(out.evidence_type)} — not one of ${EVIDENCE_TYPES.join(', ')}. Left as-is for visibility, not coerced.`,
      });
      return out;
    }

    if (out.evidence_type === 'GEOMETRY_INFERRED') {
      if (out.finding_type !== 'measure_day_checklist') {
        out.demoted_from = out.finding_type;
        out.finding_type = 'measure_day_checklist';
        warnings.push({
          type: 'geometry_inferred_demoted',
          detail: `Finding ${i} ("${String(out.description || '').slice(0, 80)}...") demoted ${out.demoted_from} -> measure_day_checklist: geometry-inferred conditions are field-verification items, never priced/actioned findings.`,
        });
      }
      const measured = `${out.description || ''} ${out.consequence || ''}`.match(MEASUREMENT_PATTERN);
      if (measured) {
        warnings.push({
          type: 'measurement_in_geometry_inferred',
          detail: `Finding ${i} states an apparent measurement value ("${measured[0]}") on GEOMETRY_INFERRED evidence — violates the quantity prohibition. Not rewritten (no paraphrasing); review before the finding is relied on.`,
        });
      }
    }

    return out;
  });

  return { findings: guarded, warnings };
}
