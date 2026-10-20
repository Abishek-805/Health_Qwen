/**
 * Shared mock fixtures for PDF endpoint tests.
 * Realistic approved + critical-audit documents derived from the same
 * clinical scenario (Elena Marlowe, CLN-70428) — no fabricated data beyond
 * this deterministic test fixture.
 */
import { DischargeDocument } from '../../../src/types/discharge';
import { AUDIT_POLICY_VERSION } from '../../audit/deterministicAudit';

export const mockApprovedDoc: DischargeDocument = {
  id: 'doc-test-101',
  currentVersion: 3,
  patientId: 'CLN-70428',
  approvalStatus: 'APPROVED',
  hospitalInfo: {
    name: 'Apollo General Hospital & Heart Center',
    department: 'Department of Cardiology',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  approvedBy: {
    name: 'Dr. Sarah Jenkins',
    role: 'Attending Physician',
    timestamp: new Date().toISOString(),
    signatureNote: 'Reviewed discharge summary, verified medication dosages, and confirmed patient understanding.',
  },
  verifiedData: {
    patient: {
      name: { value: 'Elena Marlowe', status: 'FOUND' },
      patientId: { value: 'CLN-70428', status: 'FOUND' },
      age: { value: '46', status: 'FOUND' },
      gender: { value: 'Female', status: 'FOUND' },
    },
    allergies: [
      { value: 'Penicillin — rash', status: 'FOUND' },
    ],
    medications: [
      {
        id: 'm1',
        name: 'Cefuroxime',
        dosage: '500 mg',
        dosageStatus: 'FOUND',
        frequency: 'twice daily',
        frequencyStatus: 'FOUND',
        duration: '5 days',
        durationStatus: 'FOUND',
        instructions: 'Take with meals',
        instructionsStatus: 'FOUND',
        overallStatus: 'FOUND',
      },
    ],
    followUp: [
      {
        id: 'f1',
        provider: 'Dr. Robert Evans',
        date: '',
        time: '',
        location: '',
        instructions: 'in 2 weeks',
        status: 'FOUND',
      },
    ],
    verifiedAt: new Date().toISOString(),
    verifiedBy: { name: 'Dr. Sarah Jenkins', role: 'Attending Physician' },
    isConfirmedAuthoritative: true,
    diagnosis: [{ value: 'Acute calculous cholecystitis', status: 'FOUND' }],
    procedures: [{ value: 'Laparoscopic cholecystectomy', status: 'FOUND' }],
    diet: [],
    activityRestrictions: [],
    woundCare: [],
    warningSigns: [],
    emergencyInstructions: [],
    additionalNotes: [],
  },
  generatedReport: {
    id: 'rep-101',
    version: 3,
    language: 'en',
    patientName: 'Elena Marlowe',
    patientId: 'CLN-70428',
    title: 'Discharge Instructions',
    rawMarkdown: '',
    generatedAt: new Date().toISOString(),
    sections: {
      summary: 'Patient Elena Marlowe is a 46-year-old female admitted for acute calculous cholecystitis.',
      diagnosisAndProcedures: 'Acute calculous cholecystitis. Laparoscopic cholecystectomy performed.',
      medicationInstructions: 'Cefuroxime 500 mg twice daily for 5 days with meals.',
      dietAndActivity: 'Light diet. Avoid strenuous activity for 2 weeks.',
      woundCareAndHygiene: 'Keep incision clean and dry.',
      followUpAppointments: 'Follow up with Dr. Robert Evans in 2 weeks.',
      warningSignsAndEmergency: 'Seek immediate care if fever exceeds 38.5C or severe abdominal pain occurs.',
      additionalInstructions: 'Rest and drink plenty of fluids.',
    },
  },
  auditResult: {
    policyVersion: AUDIT_POLICY_VERSION,
    auditId: 'aud-1',
    reportVersion: 3,
    auditedAt: new Date().toISOString(),
    overallStatus: 'PASS',
    recommendation: 'READY_FOR_HUMAN_APPROVAL',
    findings: [],
    categorySummaries: {} as any,
    summary: 'Audit passed',
    criticalCount: 0,
  },
};

export const mockCriticalDoc: DischargeDocument = {
  ...mockApprovedDoc,
  auditResult: {
    policyVersion: AUDIT_POLICY_VERSION,
    auditId: 'aud-2',
    reportVersion: 3,
    auditedAt: new Date().toISOString(),
    overallStatus: 'CRITICAL_ISSUE',
    recommendation: 'DO_NOT_APPROVE',
    findings: [
      {
        id: 'find-1',
        category: 'ALLERGIES',
        categoryName: 'Drug & Food Allergies',
        severity: 'CRITICAL',
        status: 'CRITICAL_ISSUE',
        title: 'Known Allergy Omitted: Penicillin - rash',
        verifiedSourceText: 'Penicillin - rash',
        generatedReportText: 'NKDA',
        whyItMatters: 'Omission of known allergy can cause fatal adverse reactions.',
        isDeterministic: true,
      },
    ],
    categorySummaries: {} as any,
    summary: 'Critical audit issues found',
    criticalCount: 1,
  },
};
