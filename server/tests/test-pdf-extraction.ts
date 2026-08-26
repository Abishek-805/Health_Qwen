import { jsPDF } from 'jspdf';
import { extractDocumentSource } from '../services/documentSourceService.js';
import { extractClinicalDataLocal } from '../services/localClinicalExtractionService.js';
import { validateSourceEvidence } from '../services/sourceEvidenceValidator.js';

export async function runPdfExtractionTests() {
  console.log('====================================================');
  console.log('RUNNING DIGITAL & SCANNED PDF EXTRACTION TESTS');
  console.log('====================================================');

  const narrativeText = `PATIENT DISCHARGE SUMMARY
Apollo Heart Center
Patient Name: Robert Vance | Patient ID: PAT-2026-0891 | Age: 62 | Gender: Male
Primary Diagnosis: Acute Laparoscopic Cholecystectomy Post-Op & Mild Hypertension
Procedures: Laparoscopic Cholecystectomy

DISCHARGE MEDICATIONS:
1. Acetaminophen 500 mg - Every 6 hours as needed. Maximum 3000 mg per 24 hours.
2. Lisinopril 10 mg - Once daily in the morning.
3. Metformin 500 mg - Twice daily with meals.

ALLERGIES:
Penicillin - causes skin rash.

FOLLOW-UP:
Follow up with Dr. Sarah Jenkins at Cardiology Outpatient Clinic on 2026-08-25 at 10:30 AM (Building B, Room 304).`;

  // 1. Convert Narrative Text into Digital PDF Buffer
  const doc = new jsPDF();
  const lines = narrativeText.split('\n');
  let y = 15;
  lines.forEach((line) => {
    doc.text(line, 15, y);
    y += 7;
  });
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

  console.log(`\n----------------------------------------------------`);
  console.log(`TEST 1: Digital PDF Text Extraction (Buffer: ${pdfBuffer.length} bytes)`);
  console.log(`----------------------------------------------------`);

  const sourceRes = await extractDocumentSource({
    fileBuffer: pdfBuffer,
    mimeType: 'application/pdf',
    fileName: 'Robert_Vance_Discharge.pdf',
  });

  console.log(`Extraction Method: ${sourceRes.extractionMethod}`);
  console.log(`Extracted Text Length: ${sourceRes.normalizedText.length}`);
  console.log(`Text Preview (first 200 chars):\n"${sourceRes.normalizedText.substring(0, 200)}..."`);

  if (sourceRes.normalizedText.length < 30) {
    throw new Error('TEST 1 FAILED: Digital PDF extraction returned less than 30 characters!');
  }
  console.log('✅ TEST 1 PASSED: Digital PDF text extracted successfully.');

  // 2. Run Qwen Extraction on extracted PDF text
  console.log(`\n----------------------------------------------------`);
  console.log(`TEST 2: Qwen Local Extraction on PDF Source Text`);
  console.log(`----------------------------------------------------`);

  const qwenRes = await extractClinicalDataLocal(sourceRes.normalizedText);
  const valRes = validateSourceEvidence(qwenRes.data, sourceRes.originalText);

  console.log(`Patient Name Extracted: "${valRes.data.patient.name.value}"`);
  console.log(`Patient ID Extracted: "${valRes.data.patient.patientId.value}"`);
  console.log(`Diagnoses Count: ${valRes.data.diagnoses.length}`);
  console.log(`Medications Count: ${valRes.data.medications.length}`);

  if (valRes.data.patient.name.value !== 'Robert Vance') {
    throw new Error(`TEST 2 FAILED: Expected patient "Robert Vance", got "${valRes.data.patient.name.value}"`);
  }
  console.log('✅ TEST 2 PASSED: Correct patient "Robert Vance" extracted from PDF.');

  // 3. Test Bad / Empty PDF Threshold Assertion
  console.log(`\n----------------------------------------------------`);
  console.log(`TEST 3: Empty/Bad PDF Buffer Threshold Assertion`);
  console.log(`----------------------------------------------------`);

  const emptyDoc = new jsPDF();
  const emptyPdfBuf = Buffer.from(emptyDoc.output('arraybuffer'));
  const emptySourceRes = await extractDocumentSource({
    fileBuffer: emptyPdfBuf,
    mimeType: 'application/pdf',
    fileName: 'Empty.pdf',
  });

  console.log(`Empty PDF Text Length: ${emptySourceRes.normalizedText.length}`);
  if (emptySourceRes.normalizedText.length >= 30) {
    throw new Error('TEST 3 FAILED: Empty PDF returned > 30 characters unexpectedly!');
  }
  console.log('✅ TEST 3 PASSED: Empty PDF returned < 30 chars, triggering threshold assertion.');

  console.log('\n====================================================');
  console.log('PDF EXTRACTION TESTS COMPLETE — ALL TESTS PASSED');
  console.log('====================================================\n');
}

if (process.argv[1]?.includes('test-pdf-extraction')) {
  runPdfExtractionTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('PDF Test execution error:', err);
      process.exit(1);
    });
}
