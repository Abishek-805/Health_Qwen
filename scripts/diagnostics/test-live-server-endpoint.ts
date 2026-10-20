import http from 'http';

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

console.log('Sending HTTP Form POST to live server at http://localhost:3000/api/generate-approved-pdf...');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/generate-approved-pdf',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  console.log('LIVE SERVER HTTP STATUS:', res.statusCode);
  console.log('CONTENT-TYPE:', res.headers['content-type']);
  console.log('CONTENT-DISPOSITION:', res.headers['content-disposition']);
  console.log('CONTENT-LENGTH:', res.headers['content-length']);

  const chunks: Buffer[] = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    console.log('RECEIVED BUFFER SIZE:', buf.length, 'bytes');
    console.log('FIRST 5 BYTES:', buf.toString('utf-8', 0, 5));
    if (res.statusCode === 200 && buf.toString('utf-8', 0, 5) === '%PDF-') {
      console.log('✓ LIVE SERVER RESPONSE VERIFIED SUCCESSFUL!');
    }
  });
});

req.on('error', (e) => {
  console.error('LIVE SERVER REQUEST ERROR:', e.message);
});

req.write(postData);
req.end();
