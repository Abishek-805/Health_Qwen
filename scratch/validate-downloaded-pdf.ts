/**
 * PHASE 23 — Validate the ACTUAL browser-downloaded file.
 * Takes the exact file Chrome created in C:\Users\ashek\Downloads,
 * checks the %PDF- magic bytes, then pdf-parses the clinical content.
 *
 * Usage: npx tsx scratch/validate-downloaded-pdf.ts "<absolute file path>"
 */
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PDFParse = require('pdf-parse');

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const stat = fs.statSync(filePath);
const bytes = fs.readFileSync(filePath);

let passed = 0;
let failed = 0;
const test = (num: number, desc: string, cond: boolean, details: string) => {
  if (cond) { console.log(`[PASS] FILE ${num}: ${desc} — ${details}`); passed++; }
  else { console.error(`[FAIL] FILE ${num}: ${desc} — ${details}`); failed++; }
};

console.log(`Inspecting: ${filePath}`);
console.log(`Size: ${stat.size} bytes | Modified: ${stat.mtime}`);

// Magic bytes
const magic = bytes.toString('utf-8', 0, 5);
test(1, 'First five bytes = %PDF-', magic === '%PDF-', `magic=${magic}`);

// Extension & filename shape
const name = filePath.split('\\').pop() || '';
test(2, 'Filename ends in .pdf', name.toLowerCase().endsWith('.pdf'), name);
test(3, 'Filename is deterministic (not UUID)',
  /^Discharge_Instructions_[\w\-]+_[\w\-]+_v\d+\.pdf$/.test(name.replace(/ \(\d+\)/, '')),
  name);

async function run() {
  let parsed: any;
  if (typeof PDFParse === 'function') {
    parsed = await PDFParse(bytes);
  } else if (PDFParse.PDFParse) {
    const inst = new PDFParse.PDFParse({ data: bytes });
    await inst.load();
    const resObj = await inst.getText();
    parsed = typeof resObj === 'string' ? { text: resObj } : resObj;
  } else {
    parsed = await PDFParse(bytes);
  }
  const t: string = parsed.text || '';
  test(4, 'pdf-parse succeeds', t.length > 200, `extracted ${t.length} chars`);

  const checks: Array<[string, string[]]> = [
    ['Patient Name & ID', ['Elena Marlowe', 'CLN-70428']],
    ['Diagnosis/Procedure content', ['cholecystitis']],
    ['Medication + Dosage + Frequency', ['Cefuroxime', '500 mg', 'twice daily']],
    ['Allergy section', ['Penicillin', 'rash']],
    ['Follow-up (provider + relative timing in instructions)', ['Dr. Robert Evans', 'in 2 weeks']],
    ['Clinician approval', ['OFFICIALLY APPROVED', 'Dr. Sarah Jenkins']],
    ['Report version', ['Report Version: v3']],
  ];
  let i = 5;
  for (const [desc, needles] of checks) {
    const missing = needles.filter((n) => !t.includes(n));
    test(i, desc, missing.length === 0, missing.length === 0 ? 'all present' : `missing: ${missing.join(', ')}`);
    i++;
  }

  console.log('====================================================');
  console.log(`DOWNLOADED FILE VALIDATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error('Validation error:', e); process.exit(1); });
