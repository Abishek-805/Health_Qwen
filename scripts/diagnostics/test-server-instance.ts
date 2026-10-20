import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { apiRouter } from '../../server/routes/api.js';

const require = createRequire(import.meta.url);
const PDFParse = require('pdf-parse');

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use('/api', apiRouter);

const server = app.listen(3005, async () => {
  console.log('Test Express server running on port 3005');

  const doc = {
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
      diagnosis: [], procedures: [], diet: [], activityRestrictions: [], woundCare: [], warningSigns: [], emergencyInstructions: [], additionalNotes: []
    },
    generatedReport: {
      id: 'rep-101', version: 3, language: 'en', patientName: 'Elena Marlowe', patientId: 'CLN-70428', title: 'Discharge', rawMarkdown: '', generatedAt: new Date().toISOString(),
      sections: { summary: 'S', diagnosisAndProcedures: 'D', medicationInstructions: 'M', dietAndActivity: 'D', woundCareAndHygiene: 'W', followUpAppointments: 'F', warningSignsAndEmergency: 'W', additionalInstructions: 'A' }
    },
    auditResult: { auditId: 'a1', reportVersion: 3, auditedAt: new Date().toISOString(), overallStatus: 'PASS', recommendation: 'READY_FOR_HUMAN_APPROVAL', findings: [], categorySummaries: {}, summary: 'Pass', criticalCount: 0 }
  };

  const payload = JSON.stringify(doc);
  const postData = 'payload=' + encodeURIComponent(payload);

  const downloadsDir = path.join(process.env.USERPROFILE || os.homedir(), 'Downloads');
  const targetFile = path.join(downloadsDir, 'Discharge_Instructions_Elena_Marlowe_CLN-70428_v3.pdf');

  const req = http.request({
    hostname: 'localhost',
    port: 3005,
    path: '/api/generate-approved-pdf',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    console.log('HTTP STATUS:', res.statusCode);
    console.log('CONTENT-TYPE:', res.headers['content-type']);
    console.log('CONTENT-DISPOSITION:', res.headers['content-disposition']);
    console.log('CONTENT-LENGTH:', res.headers['content-length']);

    const fileStream = fs.createWriteStream(targetFile);
    res.pipe(fileStream);

    fileStream.on('finish', async () => {
      fileStream.close();
      console.log('\nSaved file to:', targetFile);

      const stats = fs.statSync(targetFile);
      console.log('Physical File Size:', stats.size, 'bytes');

      const fileBuf = fs.readFileSync(targetFile);
      const magic = fileBuf.toString('utf-8', 0, 5);
      console.log('Physical File First 5 Bytes:', magic);

      if (magic === '%PDF-') {
        console.log('✓ MAGIC BYTES VERIFIED: %PDF-');
      } else {
        console.error('❌ FAILED MAGIC BYTES');
      }

      try {
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
        console.log('Extracted Text Length:', text.length, 'chars');
        console.log('Contains Elena Marlowe:', text.includes('Elena Marlowe'));
        console.log('Contains CLN-70428:', text.includes('CLN-70428'));
        console.log('Contains Cefuroxime:', text.includes('Cefuroxime'));
        console.log('Contains 500 mg:', text.includes('500 mg'));
        console.log('Contains Penicillin:', text.includes('Penicillin'));
        console.log('Contains Dr. Sarah Jenkins:', text.includes('Dr. Sarah Jenkins'));
      } catch (e: any) {
        console.error('PDF Parse Error:', e.message);
      } finally {
        server.close();
      }
    });
  });

  req.write(postData);
  req.end();
});
