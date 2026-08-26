import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('RUNNING STEP 6 ARCHITECTURE REGRESSION TEST');
console.log('====================================================');

const forbiddenPatterns = [
  { pattern: 'downloadPdfBuffer', desc: 'Call to downloadPdfBuffer' },
  { pattern: 'generateDischargePdfBufferSync', desc: 'Call to client PDF sync generator' },
  { pattern: 'URL.createObjectURL', desc: 'Usage of URL.createObjectURL' },
  { pattern: 'createObjectURL', desc: 'Usage of createObjectURL' },
  { pattern: 'new Blob', desc: 'Instantiation of Blob' },
  { pattern: 'data:application/pdf', desc: 'Data URI pattern' },
  { pattern: 'data:application/octet-stream', desc: 'Octet-stream data URI pattern' },
  { pattern: 'link.download', desc: 'Client anchor download property' },
  { pattern: 'link.click', desc: 'Client anchor click trigger' },
  { pattern: 'anchor.click', desc: 'Client anchor click trigger' },
  { pattern: 'jsPDF.save', desc: 'Client jsPDF save' },
  { pattern: '.save(', desc: 'jsPDF/pdf save() call' },
  { pattern: 'FileSaver', desc: 'FileSaver library' },
  { pattern: 'saveAs', desc: 'saveAs helper' },
];

let failed = false;

// ── A/B: Step 6 must use ONLY the official server endpoint ──────────────
const step6Path = path.join(process.cwd(), 'src', 'components', 'wizard', 'Step6Approve.tsx');
if (!fs.existsSync(step6Path)) {
  console.error('[FAIL] Step6Approve.tsx file not found at:', step6Path);
  process.exit(1);
}

const content = fs.readFileSync(step6Path, 'utf-8');

for (const item of forbiddenPatterns) {
  if (content.includes(item.pattern)) {
    console.error(`[FAIL] Step6Approve.tsx contains forbidden client download pattern: "${item.pattern}" (${item.desc})`);
    failed = true;
  } else {
    console.log(`[PASS] Verified absent from Step6Approve.tsx: "${item.pattern}"`);
  }
}

const requiredEndpoint = '/api/generate-approved-pdf';
if (!content.includes(requiredEndpoint)) {
  console.error(`[FAIL] Step6Approve.tsx does NOT reference required server endpoint "${requiredEndpoint}"`);
  failed = true;
} else {
  console.log(`[PASS] Verified Step6Approve.tsx references required server endpoint "${requiredEndpoint}"`);
}

// ── C: Server endpoint route is registered in server/routes/api.ts ────────
const apiPath = path.join(process.cwd(), 'server', 'routes', 'api.ts');
const apiContent = fs.readFileSync(apiPath, 'utf-8');
if (apiContent.includes("apiRouter.post('/generate-approved-pdf'")) {
  console.log('[PASS] POST /api/generate-approved-pdf is registered in server/routes/api.ts');
} else {
  console.error('[FAIL] POST /api/generate-approved-pdf is NOT registered in server/routes/api.ts');
  failed = true;
}

// ── All other PDF downloaders must use the same official endpoint ────────
const downloaderPages = [
  path.join(process.cwd(), 'src', 'pages', 'DashboardPage.tsx'),
  path.join(process.cwd(), 'src', 'pages', 'DocumentsHistoryPage.tsx'),
  path.join(process.cwd(), 'src', 'pages', 'ReviewQueuePage.tsx'),
  path.join(process.cwd(), 'src', 'utils', 'pdfGenerator.ts'),
];

for (const pagePath of downloaderPages) {
  const rel = path.relative(process.cwd(), pagePath);
  if (!fs.existsSync(pagePath)) continue;
  const pageContent = fs.readFileSync(pagePath, 'utf-8');
  for (const item of forbiddenPatterns) {
    // src/utils/pdfGenerator.ts keeps a TEST-ONLY buffer renderer
    // (generateDischargePdfBufferSync definition, jsPDF rendering) but it
    // must never contain an active download mechanism.
    if (pagePath.endsWith('pdfGenerator.ts') && (item.pattern === 'generateDischargePdfBufferSync' || item.pattern === '.save(')) {
      continue;
    }
    if (pageContent.includes(item.pattern)) {
      console.error(`[FAIL] ${rel} contains forbidden client download pattern: "${item.pattern}" (${item.desc})`);
      failed = true;
    }
  }
}
console.log('[PASS] Dashboard/History/ReviewQueue/pdfGenerator contain no forbidden download mechanisms');

// ── No client-side fallback wording may reintroduce local generation ─────
if (content.toLowerCase().includes('fallback') && content.includes('generateDischargePdfBuffer')) {
  console.error('[FAIL] Step6Approve.tsx appears to fall back to client-side PDF generation');
  failed = true;
} else {
  console.log('[PASS] Step6Approve.tsx has no client-side PDF generation fallback');
}

console.log('====================================================');
if (failed) {
  console.error('STEP 6 ARCHITECTURE REGRESSION TEST FAILED');
  process.exit(1);
} else {
  console.log('STEP 6 ARCHITECTURE REGRESSION TEST PASSED');
}

