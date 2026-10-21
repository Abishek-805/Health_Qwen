import type { AuditFinding, AuthoritativeDischargeData, GeneratedReport, ReportSections } from '../../src/types/discharge';
import { buildFallbackReport } from '../ai/geminiService';
import { executeHybridAudit } from '../audit/hybridAudit';
import { HttpError } from '../validation';
import { medicationReviewContext } from './medicationText';

const sections: Partial<Record<AuditFinding['category'], keyof ReportSections>> = {
  PATIENT_INFORMATION: 'summary', DIAGNOSIS: 'diagnosisAndProcedures', PROCEDURES: 'diagnosisAndProcedures',
  MEDICATIONS: 'medicationInstructions', NUMERIC_VALUES: 'medicationInstructions', ALLERGIES: 'additionalInstructions',
  FOLLOW_UP: 'followUpAppointments', DATES: 'followUpAppointments', DIET: 'dietAndActivity',
  ACTIVITY_RESTRICTIONS: 'dietAndActivity', WOUND_PROCEDURE_CARE: 'woundCareAndHygiene',
  WARNING_SIGNS: 'warningSignsAndEmergency', EMERGENCY_INSTRUCTIONS: 'warningSignsAndEmergency',
};
const signature = (finding: AuditFinding) => JSON.stringify([finding.category, finding.title, finding.verifiedSourceText]);

// shortcut: merge exact duplicates or literal schedule echoes, including misplaced timing phrases; other variants need review.
function removeMedicationEchoes(data: AuthoritativeDischargeData) {
  const clean = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  const fields = ['dosage', 'frequency', 'duration', 'instructions'] as const;
  const medications = data.medications.filter((med, index, all) => !all.some((other, otherIndex) => {
    if (other === med || med.overallStatus !== 'FOUND' || other.overallStatus !== 'FOUND') return false;
    const scheduleEcho = !!other.dosage && !!other.frequency && !medicationReviewContext.test(med.name)
      && clean(med.name) === clean(`${other.name} ${other.dosage} ${other.frequency}${other.duration ? ` for ${other.duration}` : ''}`);
    const timing = clean(other.frequency).match(/\b(?:before|after|at|with)\s+.+$/)?.[0] || (clean(other.frequency) === 'nightly' ? 'night' : '');
    const repeatedTiming = scheduleEcho && !!timing && !other.duration.trim() && other.durationStatus === 'MISSING'
      && med.durationStatus === 'FOUND' && clean(med.duration) === timing;
    const splitFrequency = repeatedTiming && med.frequencyStatus === other.frequencyStatus
      && clean(other.frequency) === `${clean(med.frequency)} ${timing}`;
    const repeatedDuration = scheduleEcho && [
      `${clean(other.duration)} for ${clean(other.duration)}`,
      `${clean(other.duration)}. for ${clean(other.duration)}`,
    ].includes(clean(med.duration));
    const repeatedInstruction = scheduleEcho && !other.instructions.trim() && other.instructionsStatus === 'MISSING'
      && med.instructionsStatus === 'FOUND' && ((!!other.duration && clean(med.instructions) === `for ${clean(other.duration)}`)
        || (repeatedTiming && clean(med.instructions) === timing));
    if (!fields.every(key => (key === 'instructions' && repeatedInstruction)
      || (key === 'duration' && repeatedTiming) || (key === 'frequency' && splitFrequency)
      || ((clean(med[key]) === clean(other[key]) || (key === 'duration' && repeatedDuration)) && med[`${key}Status`] === other[`${key}Status`]))) return false;
    if (clean(med.name) === clean(other.name)) return otherIndex < index;
    return scheduleEcho;
  }));
  return { ...data, medications };
}

export async function repairAuditFinding(data: AuthoritativeDischargeData, report: GeneratedReport, finding: AuditFinding) {
  const section = finding.id === 'det-omission-warning' ? 'warningSignsAndEmergency' : sections[finding.category];
  if (!finding.isDeterministic || !section) throw new HttpError(422, 'This finding needs manual review. Correct the verified source in Step 2 or edit the report in Step 5.');
  const verifiedData = section === 'medicationInstructions' ? removeMedicationEchoes(data) : data;
  const template = buildFallbackReport(verifiedData, 'en', report.version);
  const repaired: GeneratedReport = { ...report, sections: { ...report.sections, [section]: template.sections[section] } };
  if (finding.category === 'PATIENT_INFORMATION') {
    repaired.patientName = template.patientName; repaired.patientId = template.patientId; repaired.title = template.title;
  }
  const audit = await executeHybridAudit(verifiedData, repaired);
  if (audit.findings.some(item => signature(item) === signature(finding))) {
    throw new HttpError(422, finding.category === 'MEDICATIONS'
      ? 'This medication finding remains in a fresh section built from verified data. In Step 2, compare duplicate medication rows, names containing a full schedule, and stopped/conflicting instructions with the original source. Correct the rows, confirm, then generate and save again. No report change was saved.'
      : 'Rebuilding this section did not resolve the finding. Review the verified source in Step 2 or edit the report in Step 5. No report change was saved.');
  }
  if (section === 'medicationInstructions' && audit.findings.some(item => ['MEDICATIONS', 'NUMERIC_VALUES'].includes(item.category) && item.status === 'CRITICAL_ISSUE')) {
    throw new HttpError(422, 'Medication details still conflict. No change was saved. Compare the dose, schedule and instructions in Step 2 with the original source.');
  }
  return { report: repaired, auditResult: audit, verifiedData, removedDuplicateCount: data.medications.length - verifiedData.medications.length };
}
