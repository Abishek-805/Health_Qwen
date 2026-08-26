/**
 * LIVE SERVER VERIFICATION — Phase 19 of the PDF master rebuild.
 *
 * Makes REAL HTTP requests against the RUNNING server on port 3000.
 * Does NOT import the generator directly — every request travels through
 * the actual Express process exactly like the browser's form POST.
 *
 * Usage: npx tsx scratch/test-live-pdf-chain.ts
 */
import { mockApprovedDoc, mockCriticalDoc } from '../server/tests/fixtures/pdfTestDocument';

const BASE = 'http://localhost:3000';

let passed = 0;
let failed = 0;

function test(num: number, desc: string, cond: boolean, details: string) {
  if (cond) {
    console.log(`[PASS] LIVE ${num}: ${desc} — ${details}`);
    passed++;
  } else {
    console.error(`[FAIL] LIVE ${num}: ${desc} — ${details}`);
    failed++;
  }
}

async function run() {
  // LIVE 1: server is up
  try {
    const h = await fetch(`${BASE}/api/health`);
    test(1, 'Server alive on port 3000', h.status === 200, `GET /api/health → HTTP ${h.status}`);
  } catch (e: any) {
    test(1, 'Server alive on port 3000', false, e.message);
    console.error('Server not running — start `npm run dev` first.');
    process.exit(1);
  }

  // LIVE 2: native form POST (application/x-www-form-urlencoded, req.body.payload)
  let pdfBytes = Buffer.alloc(0);
  let disposition = '';
  let contentType = '';
  let contentLength = '';
  try {
    const formBody = new URLSearchParams({ payload: JSON.stringify(mockApprovedDoc) }).toString();
    const res = await fetch(`${BASE}/api/generate-approved-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    });
    contentType = res.headers.get('content-type') || '';
    disposition = res.headers.get('content-disposition') || '';
    contentLength = res.headers.get('content-length') || '';
    pdfBytes = Buffer.from(await res.arrayBuffer());
    const magic = pdfBytes.toString('utf-8', 0, 5);
    const ok =
      res.status === 200 &&
      contentType.includes('application/pdf') &&
      disposition.includes('attachment') &&
      disposition.includes('Discharge_Instructions_Elena_Marlowe_CLN-70428_v3.pdf') &&
      magic === '%PDF-' &&
      String(pdfBytes.length) === contentLength;
    test(2, 'Live form POST returns real PDF attachment', ok,
      `HTTP ${res.status} | CT=${contentType} | CD=${disposition} | CL=${contentLength} | magic=${magic} | ${pdfBytes.length} bytes`);
  } catch (e: any) {
    test(2, 'Live form POST returns real PDF attachment', false, e.message);
  }

  // LIVE 3: critical audit → HTTP 403, no PDF served
  try {
    const res = await fetch(`${BASE}/api/generate-approved-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ payload: JSON.stringify(mockCriticalDoc) }).toString(),
    });
    const body: any = await res.json().catch(() => ({}));
    test(3, 'Critical audit blocked with HTTP 403 CRITICAL_AUDIT_BLOCK', res.status === 403 && body.code === 'CRITICAL_AUDIT_BLOCK',
      `HTTP ${res.status} | code=${body.code}`);
  } catch (e: any) {
    test(3, 'Critical audit blocked with HTTP 403 CRITICAL_AUDIT_BLOCK', false, e.message);
  }

  // LIVE 4: precheck endpoint reachable (Step 6 validation gate)
  try {
    const res = await fetch(`${BASE}/api/precheck-approved-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockApprovedDoc),
    });
    const body: any = await res.json().catch(() => ({}));
    test(4, 'Precheck endpoint live (200 READY_FOR_OFFICIAL_PDF)', res.status === 200 && body.ok === true,
      `HTTP ${res.status} | code=${body.code}`);
  } catch (e: any) {
    test(4, 'Precheck endpoint live (200 READY_FOR_OFFICIAL_PDF)', false, e.message);
  }

  // LIVE 5: removed legacy aliases must be GONE (exactly one official path)
  try {
    const res = await fetch(`${BASE}/api/generate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockApprovedDoc),
    });
    test(5, 'Legacy alias /api/generate-pdf no longer serves PDFs', res.status === 404,
      `HTTP ${res.status} (expected 404)`);
  } catch (e: any) {
    test(5, 'Legacy alias /api/generate-pdf no longer serves PDFs', false, e.message);
  }

  // LIVE 6: pdf-parse content validation of the LIVE-delivered PDF
  if (pdfBytes.length > 1000) {
    try {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const PDFParse = require('pdf-parse');
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
      const t = parsed.text || '';
      const ok =
        t.includes('Elena Marlowe') &&
        t.includes('CLN-70428') &&
        t.includes('Cefuroxime') &&
        t.includes('500 mg') &&
        t.includes('Penicillin') &&
        t.includes('Dr. Robert Evans') &&
        t.includes('in 2 weeks') &&
        t.includes('OFFICIALLY APPROVED');
      test(6, 'Live PDF content has all clinical fields', ok, `pdf-parse extracted ${t.length} chars`);
    } catch (e: any) {
      test(6, 'Live PDF content has all clinical fields', false, e.message);
    }
  } else {
    test(6, 'Live PDF content has all clinical fields', false, 'No PDF buffer from LIVE 2');
  }

  console.log('====================================================');
  console.log(`LIVE SERVER RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('Fatal live-test error:', e);
  process.exit(1);
});
