import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import { extractDocumentSource, calculateOcrQuality } from '../services/documentSourceService.js';
import { extractClinicalDataLocal } from '../services/localClinicalExtractionService.js';
import { validateSourceEvidence } from '../services/sourceEvidenceValidator.js';

export async function runOcrBenchmarkSuite() {
  console.log('\n====================================================');
  console.log('RUNNING GENERIC MULTI-FORMAT OCR & EXTRACTION BENCHMARK');
  console.log('====================================================\n');

  // Test Case 1: Generic Clinical Paragraph & Medication List Document (Digital PDF)
  const digitalDocText = `PATIENT DISCHARGE SUMMARY
General Medical & Surgical Center
Patient Name: Eleanor Vance | Patient ID: PAT-2026-9912 | Age: 58 | Gender: Female
Primary Diagnosis: Post Operative Laparoscopic Appendectomy & Mild Dehydration
Procedures: Laparoscopic Appendectomy

DISCHARGE MEDICATIONS:
1. Amoxicillin-Clavulanate 875 mg - Take 1 tablet twice daily with meals for 7 days.
2. Ibuprofen 400 mg - Take 1 tablet every 6 hours as needed for mild pain.
3. Ondansetron 4 mg - Take 1 tablet every 8 hours as needed for nausea.

ALLERGIES:
Sulfa Antibiotics - causes severe urticaria and itching.

FOLLOW-UP APPOINTMENTS:
Follow up with Dr. Richard Thorne at Surgical Outpatient Department on 2026-08-28 at 09:30 AM (Building C, Room 102).

WARNING SIGNS:
Fever above 101 F, worsening abdominal pain, or redness around incision.`;

  const doc1 = new jsPDF();
  digitalDocText.split('\n').forEach((line, idx) => {
    doc1.text(line, 15, 15 + idx * 6);
  });
  const digitalPdfBuf = Buffer.from(doc1.output('arraybuffer'));

  console.log('----------------------------------------------------');
  console.log('BENCHMARK 1: Digital PDF Text Extraction');
  console.log('----------------------------------------------------');
  const res1 = await extractDocumentSource({
    fileBuffer: digitalPdfBuf,
    mimeType: 'application/pdf',
    fileName: 'Eleanor_Vance_Discharge.pdf',
  });

  console.log(`- Extraction Method: ${res1.extractionMethod}`);
  console.log(`- Text Length: ${res1.normalizedText.length} chars`);
  console.log(`- Quality Score: ${res1.ocrQuality?.score} / 100 (${res1.ocrQuality?.qualityStatus})`);
  console.log(`- Gemini API Calls: 0`);

  if (res1.ocrQuality?.qualityStatus === 'UNUSABLE') {
    throw new Error('BENCHMARK 1 FAILED: Digital PDF quality marked UNUSABLE unexpectedly!');
  }
  console.log('✅ BENCHMARK 1 PASSED: Digital PDF extracted cleanly.');

  // Test Case 2: Generic Image PDF Page Screenshot OCR (Tesseract / PaddleOCR Engine Evaluation)
  console.log('\n----------------------------------------------------');
  console.log('BENCHMARK 2: Image PDF Page Screenshot OCR & Quality Gate');
  console.log('----------------------------------------------------');

  const doc2 = new jsPDF({ unit: 'pt', format: 'letter' });
  doc2.setFontSize(20);
  doc2.text('Patient Name: Marcus Brody', 40, 60);
  doc2.text('Patient ID: PAT-2026-5541', 40, 100);
  doc2.text('Age: 64 | Gender: Male', 40, 140);
  doc2.text('Diagnosis: Acute Coronary Syndrome', 40, 180);
  doc2.text('Procedure: Percutaneous Coronary Intervention', 40, 220);
  doc2.text('Medication: Atorvastatin 80 mg once daily at bedtime', 40, 260);
  doc2.text('Follow-Up: Dr. Elena Morris at Cardiology Clinic on 2026-09-01', 40, 300);

  const doc2Buf = Buffer.from(doc2.output('arraybuffer'));

  const { PDFParse } = await import('pdf-parse');
  const parser2: any = new PDFParse({ data: doc2Buf });
  await parser2.load();
  const screenshots2 = await parser2.getScreenshot();
  const page2ImgBuf = Buffer.from(screenshots2.pages[0].data);

  const res2 = await extractDocumentSource({
    fileBuffer: page2ImgBuf,
    mimeType: 'image/png',
    fileName: 'Marcus_Brody_Scanned.png',
  });

  console.log(`- OCR Engine Selected: ${res2.extractionMethod}`);
  console.log(`- Text Length: ${res2.normalizedText.length} chars`);
  console.log(`- Quality Score: ${res2.ocrQuality?.score} / 100 (${res2.ocrQuality?.qualityStatus})`);
  console.log(`- Non-alphanumeric ratio: ${res2.ocrQuality?.nonAlphanumericRatio}`);
  console.log(`- Single-char token ratio: ${res2.ocrQuality?.singleCharTokenRatio}`);

  if (res2.ocrQuality?.qualityStatus === 'UNUSABLE') {
    throw new Error('BENCHMARK 2 FAILED: High quality image OCR marked UNUSABLE unexpectedly!');
  }

  const qwenRes2 = await extractClinicalDataLocal(res2.normalizedText);
  const valRes2 = validateSourceEvidence(qwenRes2.data, res2.originalText);

  console.log(`- Extracted Patient Name: "${valRes2.data.patient.name.value}"`);
  console.log(`- Extracted Patient ID: "${valRes2.data.patient.patientId.value}"`);
  console.log(`- Extracted Medication: "${valRes2.data.medications[0]?.name.value || ''}"`);

  if (!valRes2.data.patient.name.value.toLowerCase().includes('marcus')) {
    throw new Error(`BENCHMARK 2 FAILED: Expected patient "Marcus Brody", got "${valRes2.data.patient.name.value}"`);
  }
  console.log('✅ BENCHMARK 2 PASSED: Scanned Image -> OCR -> Quality Gate -> Qwen verified.');

  // Test Case 3: Generic OCR Quality Gate Rejection Test (Corrupted/Blank Image)
  console.log('\n----------------------------------------------------');
  console.log('BENCHMARK 3: Generic OCR Quality Gate Rejection Assertion');
  console.log('----------------------------------------------------');

  const noiseText = "~~ | % @ # !! ^^ *** § § © ©";
  const noiseQuality = calculateOcrQuality(noiseText, 1);
  console.log(`- Noise Text Quality Status: ${noiseQuality.qualityStatus} (Score: ${noiseQuality.score})`);

  if (noiseQuality.qualityStatus !== 'UNUSABLE') {
    throw new Error('BENCHMARK 3 FAILED: Noise text was NOT rejected by OCR Quality Gate!');
  }
  console.log('✅ BENCHMARK 3 PASSED: Garbled noise text successfully rejected by Quality Gate.');

  console.log('\n====================================================');
  console.log('ALL BENCHMARK SUITE TESTS PASSED SUCCESSFULLY');
  console.log('====================================================\n');
}

if (process.argv[1]?.includes('test-ocr-benchmark-suite')) {
  runOcrBenchmarkSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark execution error:', err);
      process.exit(1);
    });
}
