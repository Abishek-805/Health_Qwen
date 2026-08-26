import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateApprovedDischargePdf, verifyPdfBinary } from '../server/services/serverPdfGenerator';
import { DischargeDocument } from '../src/types/discharge';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFParse = require('pdf-parse');

console.log('====================================================');
console.log('PHYSICAL DOWNLOAD FILE FORENSIC VERIFICATION');
console.log('====================================================');

const doc: DischargeDocument = {
  id: 'doc-test-101',
  patientId: 'CLN-70428',
  approvalStatus: 'APPROVED',
  hospitalInfo: { name: 'Apollo General Hospital & Heart Center', department: 'Department of Cardiology' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  approvedBy: { name: 'Dr. Sarah Jenkins', role: 'Attending Physician', timestamp: new Date().toISOString(), signatureNote: 'Approved.' },
  verifiedData: {
    patient: { name: { value: 'Elena Marlowe', status: 'FOUND' }, patientId: { value: 'CLN-70428', status: 'FOUND' }, age: { value: '46', status: 'FOUND' }, gender: { value: 'Female', status: 'FOUND' } },
    allergies: [{ value: 'Penicillin — rash', status: 'FOUND' }],
    medications: [{ id: 'm1', name: 'Cefuroxime', dosage: '500 mg', dosageStatus: 'FOUND', frequency: 'twice daily', frequencyStatus: 'FOUND', duration: '5 days', durationStatus: 'FOUND', instructions: 'Take with meals', instructionsStatus: 'FOUND', overallStatus: 'FOUND' }],
    followUp: [{ id: 'f1', provider: 'Dr. Robert Evans', date: '', time: '', location: '', instructions: 'in 2 weeks', status: 'FOUND' }],
    verifiedAt: new Date().toISOString(), verifiedBy: { name: 'Dr. Sarah Jenkins', role: 'Attending Physician' }, isConfirmedAuthoritative: true,
    diagnosis: [{ value: 'Acute calculous cholecystitis', status: 'FOUND' }],
    procedures: [{ value: 'Laparoscopic cholecystectomy', status: 'FOUND' }],
    diet: [], activityRestrictions: [], woundCare: [], warningSigns: [], emergencyInstructions: [], additionalNotes: []
  },
  generatedReport: {
    id: 'rep-101', version: 3, language: 'en', patientName: 'Elena Marlowe', patientId: 'CLN-70428', title: 'Discharge', rawMarkdown: '', generatedAt: new Date().toISOString(),
    sections: { summary: 'Patient Elena Marlowe is a 46-year-old female admitted for acute calculous cholecystitis.', diagnosisAndProcedures: 'Acute calculous cholecystitis. Laparoscopic cholecystectomy performed.', medicationInstructions: 'Cefuroxime 500 mg twice daily for 5 days.', dietAndActivity: 'Light diet.', woundCareAndHygiene: 'Keep dry.', followUpAppointments: 'Follow up with Dr. Robert Evans in 2 weeks.', warningSignsAndEmergency: 'Seek immediate care if fever occurs.', additionalInstructions: 'Rest.' }
  },
  auditResult: { auditId: 'a1', reportVersion: 3, auditedAt: new Date().toISOString(), overallStatus: 'PASS', recommendation: 'READY_FOR_HUMAN_APPROVAL', findings: [], categorySummaries: {} as any, summary: 'Pass', criticalCount: 0 }
};

const pdfResult = generateApprovedDischargePdf(doc);

const downloadsDir = path.join(process.env.USERPROFILE || os.homedir(), 'Downloads');
const targetFile = path.join(downloadsDir, pdfResult.filename);

console.log('1. Target File Path:', targetFile);
console.log('2. Content-Type:', pdfResult.mimeType);
console.log('3. Content-Disposition Filename:', pdfResult.filename);

// Write to physical filesystem
fs.writeFileSync(targetFile, pdfResult.buffer);

console.log('\n--- PHYSICAL FILE INSPECTION ---');
const stats = fs.statSync(targetFile);
console.log('4. Physical File Exists:', fs.existsSync(targetFile));
console.log('5. Physical File Size:', stats.size, 'bytes');

const fileBuf = fs.readFileSync(targetFile);
const magic = fileBuf.toString('utf-8', 0, 5);
console.log('6. Physical File First 5 Bytes:', magic);

if (magic === '%PDF-') {
  console.log('✓ MAGIC BYTES VERIFIED: %PDF-');
} else {
  console.error('❌ FAILED MAGIC BYTES');
}

async function runPdfParse() {
  let text = '';
  if (typeof PDFParse === 'function') {
    const parsed = await PDFParse(fileBuf);
    text = parsed.text || '';
  } else if (PDFParse.PDFParse) {
    const inst = new PDFParse.PDFParse({ data: fileBuf });
    await inst.load();
    const resObj = await inst.getText();
    text = typeof resObj === 'string' ? resObj : resObj.text || '';
  } else {
    const parsed = await PDFParse(fileBuf);
    text = parsed.text || '';
  }

  console.log('\n--- PDF-PARSE PHYSICAL FILE CONTENT ---');
  console.log('Extracted Text Length:', text.length, 'characters');
  console.log('  Elena Marlowe:', text.includes('Elena Marlowe'));
  console.log('  CLN-70428:', text.includes('CLN-70428'));
  console.log('  Cefuroxime:', text.includes('Cefuroxime'));
  console.log('  500 mg:', text.includes('500 mg'));
  console.log('  twice daily:', text.includes('twice daily'));
  console.log('  Penicillin:', text.includes('Penicillin'));
  console.log('  rash:', text.includes('rash'));
  console.log('  Dr. Robert Evans:', text.includes('Dr. Robert Evans'));
  console.log('  in 2 weeks:', text.includes('in 2 weeks'));
  console.log('  Dr. Sarah Jenkins:', text.includes('Dr. Sarah Jenkins'));
  console.log('  v3:', text.includes('v3'));
}

runPdfParse().catch(console.error);
