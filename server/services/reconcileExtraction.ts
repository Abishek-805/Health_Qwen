import type { CanonicalDischargeExtraction, ExtractedField } from './clinicalExtractionService';
import { normalizeForMatching as key } from './sourceEvidenceValidator';

export function reconcileExtractions(proposed: CanonicalDischargeExtraction, structured: CanonicalDischargeExtraction, rawProposed: unknown): CanonicalDischargeExtraction {
  // shortcut: equal values share uncertainty; add field provenance if unrelated fields need separate review.
  const explicitUnclear = new Set<string>();
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.status === 'string' && value.status.trim().toUpperCase() === 'UNCLEAR' && typeof value.value === 'string' && key(value.value)) explicitUnclear.add(key(value.value));
    Object.values(value).forEach(visit);
  };
  visit(rawProposed);
  const empty: ExtractedField = { value: '', status: 'MISSING', evidence: '' };
  const field = (a?: ExtractedField, b?: ExtractedField): ExtractedField => {
    if (!a?.value) return b ? { ...b, status: explicitUnclear.has(key(b.value)) ? 'UNCLEAR' : b.status } : empty;
    if (!b?.value || key(a.value) !== key(b.value)) return { ...a, status: 'UNCLEAR' };
    return { ...b, value: a.value, status: explicitUnclear.has(key(a.value)) ? 'UNCLEAR' : b.status };
  };
  const rows = <T>(first: T[], second: T[], identity: (row: T) => string, merge: (a?: T, b?: T) => T): T[] => {
    const used = new Set<number>();
    const combined = first.map(a => {
      const index = second.findIndex((b, i) => !used.has(i) && identity(a) === identity(b));
      if (index >= 0) used.add(index);
      return merge(a, index >= 0 ? second[index] : undefined);
    });
    return combined.concat(second.flatMap((b, index) => used.has(index) ? [] : [merge(undefined, b)]));
  };
  const group = <K extends string>(a: Record<K, ExtractedField> | undefined, b: Record<K, ExtractedField> | undefined, keys: K[]): Record<K, ExtractedField> => {
    // Reassign composite proposals only when every proposed value survives in the structured fields.
    const combined = key(keys.map(name => b?.[name]?.value || '').join(' '));
    const canAlign = a && b && keys.every(name => !a[name].value || (!explicitUnclear.has(key(a[name].value)) && (' ' + combined + ' ').includes(' ' + key(a[name].value) + ' ')));
    return Object.fromEntries(keys.map(name => [name, field(canAlign ? undefined : a?.[name], b?.[name])])) as Record<K, ExtractedField>;
  };
  const result: CanonicalDischargeExtraction = {
    patient: { name: field(proposed.patient.name, structured.patient.name), patientId: field(proposed.patient.patientId, structured.patient.patientId), age: field(proposed.patient.age, structured.patient.age), gender: field(proposed.patient.gender, structured.patient.gender) },
    diagnoses: [], procedures: [], medications: [], allergies: [], dietaryInstructions: [], woundCare: [], activityRestrictions: [], followUpAppointments: [], warningSigns: [], emergencyInstructions: [], additionalNotes: [],
  };
  for (const section of ['diagnoses', 'procedures', 'allergies', 'dietaryInstructions', 'woundCare', 'activityRestrictions', 'warningSigns', 'emergencyInstructions', 'additionalNotes'] as const) {
    result[section] = rows(proposed[section] || [], structured[section] || [], item => key(item.value), field);
  }
  result.medications = rows(proposed.medications, structured.medications, item => key(item.name.value), (a, b) => group(a, b, ['name', 'dosage', 'frequency', 'duration', 'instructions']));
  result.followUpAppointments = rows(proposed.followUpAppointments, structured.followUpAppointments, item => key(item.provider.value), (a, b) => group(a, b, ['provider', 'date', 'time', 'location', 'instructions']));
  return result;
}
