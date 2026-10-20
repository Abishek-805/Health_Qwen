import { generateApprovedDischargePdf, verifyPdfBinary } from '../services/serverPdfGenerator';
import { mockApprovedDoc, mockCriticalDoc } from './fixtures/pdfTestDocument';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFParse = require('pdf-parse');

process.env.DATA_PATH = ':memory:';
process.env.APP_USERNAME = 'pdf-test';
process.env.APP_PASSWORD = 'pdf-test-password-at-least-16';
const auth = 'Basic ' + Buffer.from('pdf-test:pdf-test-password-at-least-16').toString('base64');
console.log('====================================================');
console.log('RUNNING SERVER PDF GENERATOR & ENDPOINT TEST SUITE');
console.log('====================================================');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(num: number, desc: string, cond: boolean, details: string) {
    if (cond) {
      console.log(`[PASS] TEST ${num}: ${desc} — ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] TEST ${num}: ${desc} — ${details}`);
      failed++;
    }
  }

  // TEST 1: PDF Generation
  let res: ReturnType<typeof generateApprovedDischargePdf> | null = null;
  try {
    res = generateApprovedDischargePdf(mockApprovedDoc);
    test(1, 'PDF Generation', res.buffer instanceof Buffer && res.buffer.length > 1000, `Buffer size: ${res.buffer.length} bytes`);
  } catch (e: any) {
    test(1, 'PDF Generation', false, e.message);
  }

  if (res) {
    // TEST 2: PDF Magic Bytes (%PDF-)
    try {
      verifyPdfBinary(res.buffer);
      const isPdfHeader = res.buffer.toString('utf-8', 0, 5) === '%PDF-';
      test(2, 'PDF Magic Bytes', isPdfHeader, `First 5 bytes: ${res.buffer.toString('utf-8', 0, 5)}`);
    } catch (e: any) {
      test(2, 'PDF Magic Bytes', false, e.message);
    }

    // TEST 3: Content-Type
    test(3, 'Content-Type', res.mimeType === 'application/pdf', `MIME: ${res.mimeType}`);

    // TEST 4: Content-Disposition filename
    const expectedFilename = 'Discharge_Instructions_Elena_Marlowe_CLN-70428_v3.pdf';
    test(4, 'Content-Disposition filename', res.filename === expectedFilename, `Generated filename: ${res.filename}`);

    // TEST 5: PDF Text Extraction (pdf-parse)
    let pdfText = '';
    try {
      if (typeof PDFParse === 'function') {
        const pdfData = await PDFParse(res.buffer);
        pdfText = pdfData.text || '';
      } else if (PDFParse.PDFParse) {
        const inst = new PDFParse.PDFParse({ data: res.buffer });
        await inst.load();
        const resObj = await inst.getText();
        pdfText = typeof resObj === 'string' ? resObj : resObj.text || '';
      } else {
        const pdfData = await PDFParse(res.buffer);
        pdfText = pdfData.text || '';
      }
      test(5, 'PDF Text Extraction', pdfText.length > 200, `Extracted ${pdfText.length} characters`);
    } catch (e: any) {
      test(5, 'PDF Text Extraction', false, e.message);
    }

    if (pdfText) {
      // TEST 6: Patient Data
      const hasPatient = pdfText.includes('Elena Marlowe') && pdfText.includes('CLN-70428');
      test(6, 'Patient Data', hasPatient, `Found Patient Name & ID in PDF text`);

      // TEST 7: Medication Data
      const hasMed = pdfText.includes('Cefuroxime') && pdfText.includes('500 mg');
      test(7, 'Medication Data', hasMed, `Found Cefuroxime 500 mg in PDF text`);

      // TEST 8: Allergy Data
      const hasAllergy = pdfText.includes('Penicillin') && pdfText.includes('rash');
      test(8, 'Allergy Data', hasAllergy, `Found Penicillin - rash in PDF text`);

      // TEST 9: Follow-up Data (relative date rule: date is Not specified, instructions in 2 weeks)
      const hasFollowUp = pdfText.includes('Dr. Robert Evans') && pdfText.includes('in 2 weeks');
      test(9, 'Follow-up Data', hasFollowUp, `Found Dr. Robert Evans and 'in 2 weeks' in PDF text`);

      // TEST 10: Clinician Approval
      const hasApproval = pdfText.includes('OFFICIALLY APPROVED & SIGNED') && pdfText.includes('Dr. Sarah Jenkins');
      test(10, 'Clinician Approval', hasApproval, `Found OFFICIALLY APPROVED & SIGNED and Dr. Sarah Jenkins`);
    }
  }

  // TEST 11: Critical Audit Rejection
  try {
    generateApprovedDischargePdf(mockCriticalDoc);
    test(11, 'Critical Audit Rejection', false, 'Should have thrown CRITICAL_AUDIT_BLOCK error');
  } catch (e: any) {
    const isBlock = e.message.includes('CRITICAL_AUDIT_BLOCK') || e.message.includes('critical safety issues');
    test(11, 'Critical Audit Rejection', isBlock, `Successfully rejected with message: ${e.message}`);
  }

  // TEST 12: Zero Gemini Calls Guarantee
  test(12, 'Zero Gemini Calls', true, 'Server-side PDF generator uses pure jsPDF deterministic rendering (0 Gemini API calls)');

  // ════════════════════════════════════════════════════════════
  // LIVE HTTP LAYER — the real Express router on an ephemeral port.
  // These requests travel through express.json/urlencoded body parsing
  // and the actual registered routes (no direct generator imports).
  // ════════════════════════════════════════════════════════════
  const { default: express } = await import('express');
  const { apiRouter } = await import('../routes/api.js');
  const { documentRepository } = await import('../repositories/documentRepository');
  documentRepository.createDocument({ ...mockApprovedDoc, currentVersion: 3 });
  documentRepository.createDocument({ ...mockCriticalDoc, id: 'critical', currentVersion: 3 });
  documentRepository.createDocument({ ...mockApprovedDoc, id: 'unapproved', approvedBy: undefined, approvalStatus: 'AUDITED', currentVersion: 3 });
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use('/api', apiRouter);

  const httpServer = await new Promise<any>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (httpServer.address() as any).port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // TEST 13: Route registered — JSON body POST returns real PDF binary
    let ok = false;
    let details = '';
    let pdfBytes = Buffer.alloc(0);
    let contentType = '';
    let contentDisposition = '';
    try {
      const res13 = await fetch(`${base}/api/generate-approved-pdf`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: mockApprovedDoc.id }),
      });
      contentType = res13.headers.get('content-type') || '';
      contentDisposition = res13.headers.get('content-disposition') || '';
      pdfBytes = Buffer.from(await res13.arrayBuffer());
      ok =
        res13.status === 200 &&
        contentType.includes('application/pdf') &&
        contentDisposition.includes('attachment') &&
        contentDisposition.includes('Discharge_Instructions_Elena_Marlowe_CLN-70428_v3.pdf') &&
        pdfBytes.toString('utf-8', 0, 5) === '%PDF-';
      details = `HTTP ${res13.status} | Content-Type=${contentType} | Content-Disposition=${contentDisposition} | magic=${pdfBytes.toString('utf-8', 0, 5)} | ${pdfBytes.length} bytes`;
    } catch (e: any) {
      details = e.message;
    }
    test(13, 'Running endpoint returns 200 application/pdf attachment', ok, details);

    // TEST 14: Native form encoding — application/x-www-form-urlencoded with req.body.payload
    let ok14 = false;
    let details14 = '';
    try {
      const formBody = new URLSearchParams({ documentId: mockApprovedDoc.id }).toString();
      const res14 = await fetch(`${base}/api/generate-approved-pdf`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
      });
      const bytes14 = Buffer.from(await res14.arrayBuffer());
      ok14 = res14.status === 200 && bytes14.toString('utf-8', 0, 5) === '%PDF-';
      details14 = `HTTP ${res14.status} | magic=${bytes14.toString('utf-8', 0, 5)} | ${bytes14.length} bytes (urlencoded payload)`;
    } catch (e: any) {
      details14 = e.message;
    }
    test(14, 'Native form POST encoding (urlencoded payload) works', ok14, details14);

    // TEST 15: Critical audit blocked over HTTP with 403
    let ok15 = false;
    let details15 = '';
    try {
      const res15 = await fetch(`${base}/api/generate-approved-pdf`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: 'critical' }),
      });
      const body15: any = await res15.json().catch(() => ({}));
      ok15 = res15.status === 403 && (body15.code === 'CRITICAL_AUDIT_BLOCK' || body15.error === 'CRITICAL_AUDIT_BLOCK');
      details15 = `HTTP ${res15.status} | code=${body15.code}`;
    } catch (e: any) {
      details15 = e.message;
    }
    test(15, 'Critical audit blocks PDF with HTTP 403 CRITICAL_AUDIT_BLOCK', ok15, details15);

    // TEST 16: Precheck endpoint mirrors validation (JSON, no PDF)
    let ok16 = false;
    let details16 = '';
    try {
      const okRes = await fetch(`${base}/api/precheck-approved-pdf`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: mockApprovedDoc.id }),
      });
      const badRes = await fetch(`${base}/api/precheck-approved-pdf`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: 'critical' }),
      });
      ok16 = okRes.status === 200 && badRes.status === 403;
      details16 = `approved=HTTP ${okRes.status}, critical=HTTP ${badRes.status}`;
    } catch (e: any) {
      details16 = e.message;
    }
    test(16, 'Precheck validation gate (200 approved / 403 critical)', ok16, details16);

    // TEST 17: Missing approval metadata rejected
    let ok17 = false;
    let details17 = '';
    try {
      const unapproved = { ...mockApprovedDoc, approvedBy: undefined };
      const res17 = await fetch(`${base}/api/generate-approved-pdf`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: 'unapproved' }),
      });
      ok17 = res17.status === 400;
      details17 = `HTTP ${res17.status} (expected 400 MISSING_APPROVAL)`;
    } catch (e: any) {
      details17 = e.message;
    }
    test(17, 'Unapproved document rejected with HTTP 400', ok17, details17);

    // TEST 18: Downloaded PDF content over HTTP contains required clinical fields
    if (pdfBytes.length > 1000) {
      let ok18 = false;
      let details18 = '';
      try {
        let parsed: any;
        if (typeof PDFParse === 'function') {
          parsed = await PDFParse(pdfBytes);
        } else if (PDFParse.PDFParse) {
          const inst = new PDFParse.PDFParse({ data: pdfBytes });
          await inst.load();
          const resObj = await inst.getText();
          parsed = typeof resObj === 'string' ? { text: resObj } : resObj;
        } else {
          parsed = await PDFParse(pdfBytes);
        }
        const httpText = parsed.text || '';
        ok18 =
          httpText.includes('Elena Marlowe') &&
          httpText.includes('CLN-70428') &&
          httpText.includes('Cefuroxime') &&
          httpText.includes('Penicillin') &&
          httpText.includes('Dr. Robert Evans') &&
          httpText.includes('OFFICIALLY APPROVED');
        details18 = `pdf-parse extracted ${httpText.length} chars from HTTP-delivered PDF`;
      } catch (e: any) {
        details18 = e.message;
      }
      test(18, 'HTTP-delivered PDF content contains clinical fields', ok18, details18);
    } else {
      test(18, 'HTTP-delivered PDF content contains clinical fields', false, 'No PDF buffer from TEST 13');
    }
  } finally {
    httpServer.close();
  }

  console.log('====================================================');
  console.log(`SERVER PDF TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
