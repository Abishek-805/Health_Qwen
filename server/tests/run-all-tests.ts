import { executeHybridAudit } from '../audit/hybridAudit.js';
import { extractDocumentSource } from '../services/documentSourceService.js';
import { validateSourceEvidence } from '../services/sourceEvidenceValidator.js';
import { CanonicalDischargeExtraction, mapCanonicalToStructured } from '../services/clinicalExtractionService.js';
import { AuthoritativeDischargeData, GeneratedReport } from '../../src/types/discharge.js';
import { runOcrBenchmarkSuite } from './test-ocr-benchmark-suite.js';

function createMockVerifiedData(): AuthoritativeDischargeData {
  return {
    isConfirmedAuthoritative: true,
    verifiedAt: new Date().toISOString(),
    verifiedBy: { name: 'Dr. Test', role: 'Attending' },
    patient: {
      name: { value: 'Robert Vance', status: 'FOUND' },
      patientId: { value: 'PAT-2026-0891', status: 'FOUND' },
      age: { value: '62', status: 'FOUND' },
      gender: { value: 'Male', status: 'FOUND' },
    },
    diagnosis: [{ value: 'Acute Laparoscopic Cholecystectomy Post-Op', status: 'FOUND' }],
    procedures: [{ value: 'Laparoscopic Cholecystectomy', status: 'FOUND' }],
    medications: [
      {
        id: 'm1',
        name: 'Acetaminophen',
        dosage: '500 mg',
        dosageStatus: 'FOUND',
        frequency: 'Every 6 hours as needed',
        frequencyStatus: 'FOUND',
        duration: '5-7 days',
        durationStatus: 'FOUND',
        instructions: 'Maximum 3000 mg per 24 hours',
        instructionsStatus: 'FOUND',
        overallStatus: 'FOUND',
      },
    ],
    allergies: [{ value: 'Penicillin', status: 'FOUND' }],
    diet: [{ value: 'Light regular diet', status: 'FOUND' }],
    activityRestrictions: [{ value: 'Avoid heavy exercise for 2 weeks', status: 'FOUND' }],
    woundCare: [{ value: 'Keep incision dressing clean and dry', status: 'FOUND' }],
    followUp: [
      {
        id: 'f1',
        provider: 'Dr. Sarah',
        date: '2026-08-20',
        time: '10:00 AM',
        location: 'Clinic A',
        instructions: 'Bring surgical follow up note',
        status: 'FOUND',
      },
    ],
    warningSigns: [{ value: 'Fever or severe abdominal pain', status: 'FOUND' }],
    emergencyInstructions: [{ value: 'Call emergency helpline if severe pain persists', status: 'FOUND' }],
    additionalNotes: [],
  };
}

function createBaseReport(): GeneratedReport {
  return {
    id: 'rep-test-base',
    version: 1,
    language: 'en',
    patientName: 'Robert Vance',
    patientId: 'PAT-2026-0891',
    title: 'Discharge Instructions — Robert Vance (PAT-2026-0891)',
    sections: {
      summary: 'Dear Robert Vance (PAT-2026-0891), here are your discharge instructions.',
      diagnosisAndProcedures: 'Diagnosis: Acute Laparoscopic Cholecystectomy Post-Op. Procedure: Laparoscopic Cholecystectomy.',
      medicationInstructions: 'Take Acetaminophen 500 mg Every 6 hours as needed for 5-7 days. Maximum 3000 mg per 24 hours.',
      dietAndActivity: 'Diet: Light regular diet. Activity: Avoid heavy exercise for 2 weeks.',
      woundCareAndHygiene: 'Keep incision dressing clean and dry.',
      followUpAppointments: 'Follow up with Dr. Sarah on 2026-08-20 at 10:00 AM.',
      warningSignsAndEmergency: 'Warning Signs: Fever or severe abdominal pain. Emergency: Call emergency helpline.',
      additionalInstructions: 'Known Allergies: Penicillin.',
    },
    rawMarkdown: '',
    generatedAt: new Date().toISOString(),
  };
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('RUNNING AUTOMATED EXTRACTION & AUDIT TEST SUITE');
  console.log('====================================================');

  let passedTests = 0;
  let totalTests = 0;

  // TEST 1: Plain text document source extraction (0 Gemini calls)
  totalTests++;
  try {
    const textDoc = 'PATIENT DISCHARGE NOTE\nName: John Doe\nDiagnosis: Hypertension\nMedication: Lisinopril 10 mg daily';
    const sourceRes = await extractDocumentSource({ textInput: textDoc });
    if (sourceRes.sourceText === textDoc && sourceRes.sourceType === 'text') {
      console.log('✅ TEST 1 PASSED: Local documentSourceService extracted text verbatim without LLM API calls.');
      passedTests++;
    } else {
      console.error('❌ TEST 1 FAILED: Incorrect source extraction result:', sourceRes);
    }
  } catch (err: any) {
    console.error('❌ TEST 1 FAILED with error:', err);
  }

  // TEST 2: Deterministic Evidence Validation & Downgrade
  totalTests++;
  try {
    const sampleCanonical: CanonicalDischargeExtraction = {
      patient: {
        name: { value: 'John Smith', status: 'FOUND', evidence: 'John Smith' },
        patientId: { value: 'PAT-12345', status: 'FOUND', evidence: 'PAT-12345' },
        age: { value: '45', status: 'FOUND', evidence: '45' },
        gender: { value: 'Male', status: 'FOUND', evidence: 'Male' },
      },
      diagnoses: [{ value: 'Hypertension', status: 'FOUND', evidence: 'Hypertension' }],
      procedures: [{ value: 'Hallucinated Surgery', status: 'FOUND', evidence: 'Hallucinated Surgery' }],
      medications: [],
      allergies: [],
      dietaryInstructions: [],
      woundCare: [],
      activityRestrictions: [],
      followUpAppointments: [],
      warningSigns: [],
      emergencyInstructions: [],
    };

    const rawSource = 'PATIENT SUMMARY\nName: John Smith | ID: PAT-12345 | Age: 45 | Sex: Male\nDiagnosis: Essential Hypertension';
    const valRes = validateSourceEvidence(sampleCanonical, rawSource);

    const procStatus = valRes.data.procedures[0]?.status;
    const diagStatus = valRes.data.diagnoses[0]?.status;

    if (diagStatus === 'FOUND' && procStatus === 'UNCLEAR') {
      console.log('✅ TEST 2 PASSED: Evidence validator correctly preserved verified items and downgraded hallucinated items.');
      passedTests++;
    } else {
      console.error('❌ TEST 2 FAILED: Expected FOUND for diag and UNCLEAR for proc, got:', diagStatus, procStatus);
    }
  } catch (err: any) {
    console.error('❌ TEST 2 FAILED with error:', err);
  }

  // TEST 3: Canonical to Structured Type Mapping
  totalTests++;
  try {
    const sampleCanonical: CanonicalDischargeExtraction = {
      patient: {
        name: { value: 'Robert Vance', status: 'FOUND', evidence: 'Robert Vance' },
        patientId: { value: 'PAT-2026-0891', status: 'FOUND', evidence: 'PAT-2026-0891' },
        age: { value: '62', status: 'FOUND', evidence: '62' },
        gender: { value: 'Male', status: 'FOUND', evidence: 'Male' },
      },
      diagnoses: [{ value: 'Acute Laparoscopic Cholecystectomy Post-Op', status: 'FOUND', evidence: 'Post-Op' }],
      procedures: [{ value: 'Laparoscopic Cholecystectomy', status: 'FOUND', evidence: 'Laparoscopic Cholecystectomy' }],
      medications: [
        {
          name: { value: 'Acetaminophen', status: 'FOUND', evidence: 'Acetaminophen' },
          dosage: { value: '500 mg', status: 'FOUND', evidence: '500 mg' },
          frequency: { value: 'Every 6 hours as needed', status: 'FOUND', evidence: 'Every 6 hours' },
          duration: { value: '5-7 days', status: 'FOUND', evidence: '5-7 days' },
          instructions: { value: 'Maximum 3000 mg per 24 hours', status: 'FOUND', evidence: 'Max 3000 mg' },
        },
      ],
      allergies: [],
      dietaryInstructions: [],
      woundCare: [],
      activityRestrictions: [],
      followUpAppointments: [],
      warningSigns: [],
      emergencyInstructions: [],
    };

    const structured = mapCanonicalToStructured(sampleCanonical);
    if (
      structured.patient.name.value === 'Robert Vance' &&
      structured.medications[0].instructions === 'Maximum 3000 mg per 24 hours' &&
      structured.procedures[0].value === 'Laparoscopic Cholecystectomy'
    ) {
      console.log('✅ TEST 3 PASSED: Canonical to Structured mapper executed cleanly.');
      passedTests++;
    } else {
      console.error('❌ TEST 3 FAILED: Mapping error:', structured);
    }
  } catch (err: any) {
    console.error('❌ TEST 3 FAILED with error:', err);
  }

  // TEST 4: Hybrid Safety Audit - Clean Report
  totalTests++;
  const verified1 = createMockVerifiedData();
  const report1 = createBaseReport();
  const res1 = await executeHybridAudit(verified1, report1);
  if (res1.overallStatus === 'PASS') {
    console.log('✅ TEST 4 PASSED: Clean report correctly returned PASS.');
    passedTests++;
  } else {
    console.error('❌ TEST 4 FAILED: Expected PASS but got:', res1.overallStatus);
  }

  // TEST 5: Hybrid Safety Audit - Patient ID mismatch
  totalTests++;
  const report2 = createBaseReport();
  report2.patientId = 'PAT-99999';
  const res2 = await executeHybridAudit(verified1, report2);
  if (res2.overallStatus === 'CRITICAL_ISSUE' && res2.recommendation === 'DO_NOT_APPROVE') {
    console.log('✅ TEST 5 PASSED: Patient ID mismatch correctly returned CRITICAL_ISSUE.');
    passedTests++;
  } else {
    console.error('❌ TEST 5 FAILED: Expected CRITICAL_ISSUE but got:', res2.overallStatus);
  }

  // TEST 6: Hybrid Safety Audit - Dosage mismatch
  totalTests++;
  const report3 = createBaseReport();
  report3.sections.medicationInstructions = 'Take Acetaminophen 1000 mg Every 6 hours as needed.';
  const res3 = await executeHybridAudit(verified1, report3);
  if (res3.overallStatus === 'CRITICAL_ISSUE') {
    console.log('✅ TEST 6 PASSED: Dosage mismatch (500mg vs 1000mg) correctly returned CRITICAL_ISSUE.');
    passedTests++;
  } else {
    console.error('❌ TEST 6 FAILED: Expected CRITICAL_ISSUE but got:', res3.overallStatus);
  }

  // TEST 7: Generic Multi-Format OCR & Quality Gate Benchmark Suite
  totalTests++;
  try {
    await runOcrBenchmarkSuite();
    console.log('✅ TEST 7 PASSED: Generic OCR quality gate benchmark suite executed cleanly.');
    passedTests++;
  } catch (err: any) {
    console.error('❌ TEST 7 FAILED with error:', err);
  }

  console.log('====================================================');
  console.log(`TEST RESULTS SUMMARY: ${passedTests}/${totalTests} TESTS PASSED.`);
  console.log('====================================================');

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test runner execution error:', err);
  process.exit(1);
});
