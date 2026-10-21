import type { AuditFinding, AuthoritativeDischargeData, GeneratedReport, ReportSections } from '../../src/types/discharge';
import { buildFallbackReport } from '../ai/geminiService';
import { executeHybridAudit } from '../audit/hybridAudit';
import { HttpError } from '../validation';

const sections: Partial<Record<AuditFinding['category'], keyof ReportSections>> = {
  PATIENT_INFORMATION: 'summary', DIAGNOSIS: 'diagnosisAndProcedures', PROCEDURES: 'diagnosisAndProcedures',
  MEDICATIONS: 'medicationInstructions', NUMERIC_VALUES: 'medicationInstructions', ALLERGIES: 'additionalInstructions',
  FOLLOW_UP: 'followUpAppointments', DATES: 'followUpAppointments', DIET: 'dietAndActivity',
  ACTIVITY_RESTRICTIONS: 'dietAndActivity', WOUND_PROCEDURE_CARE: 'woundCareAndHygiene',
  WARNING_SIGNS: 'warningSignsAndEmergency', EMERGENCY_INSTRUCTIONS: 'warningSignsAndEmergency',
};
const signature = (finding: AuditFinding) => JSON.stringify([finding.category, finding.title, finding.verifiedSourceText]);

export async function repairAuditFinding(data: AuthoritativeDischargeData, report: GeneratedReport, finding: AuditFinding) {
  const section = finding.id === 'det-omission-warning' ? 'warningSignsAndEmergency' : sections[finding.category];
  if (!finding.isDeterministic || !section) throw new HttpError(422, 'This finding needs manual review. Correct the verified source in Step 2 or edit the report in Step 5.');
  const template = buildFallbackReport(data, 'en', report.version);
  const repaired: GeneratedReport = { ...report, sections: { ...report.sections, [section]: template.sections[section] } };
  if (finding.category === 'PATIENT_INFORMATION') {
    repaired.patientName = template.patientName; repaired.patientId = template.patientId; repaired.title = template.title;
  }
  const audit = await executeHybridAudit(data, repaired);
  if (audit.findings.some(item => signature(item) === signature(finding))) {
    throw new HttpError(422, finding.category === 'MEDICATIONS'
      ? 'This medication finding remains in a fresh section built from verified data. In Step 2, compare duplicate medication rows, names containing a full schedule, and stopped/conflicting instructions with the original source. Correct the rows, confirm, then generate and save again. No report change was saved.'
      : 'Rebuilding this section did not resolve the finding. Review the verified source in Step 2 or edit the report in Step 5. No report change was saved.');
  }
  return { report: repaired, auditResult: audit };
}
