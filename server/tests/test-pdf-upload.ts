import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { jsPDF } from 'jspdf';
import { PDFParse } from 'pdf-parse';
import { extractDocumentSource } from '../services/documentSourceService';

// Synthetic content only; exercise multipart PDF upload rather than the pasted-text route.
const source = new jsPDF({ unit: 'pt', format: 'letter' });
source.setFontSize(18);
['SYNTHETIC TEST ONLY', 'Patient Name: Morgan Vale', 'Patient ID: SYN-772', 'Age: 52', 'Gender: Male', 'Diagnosis: Ankle sprain']
  .forEach((line, i) => source.text(line, 40, 60 + i * 32));
source.addPage();
['Medications:', 'Acetaminophen 500 mg twice daily for 3 days.', 'Omeprazole 20 mg once daily before breakfast.', 'Atorvastatin 40 mg nightly.']
  .forEach((line, i) => source.text(line, 40, 60 + i * 32));
const digitalPdf = Buffer.from(source.output('arraybuffer'));
const parser = new PDFParse({ data: digitalPdf });
const scan = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
try {
  const rendered = await parser.getScreenshot({ desiredWidth: 1600 });
  assert.equal(rendered.pages.length, 2);
  rendered.pages.forEach((page, i) => {
    if (i) scan.addPage();
    scan.addImage(new Uint8Array(page.data), 'PNG', 0, 0, 612, 792, undefined, 'FAST');
  });
} finally { await parser.destroy(); }
const scannedPdf = Buffer.from(scan.output('arraybuffer'));
assert.ok(scannedPdf.length < 15 * 1024 * 1024, 'Synthetic scanned fixture must fit the upload limit.');
const sourceChecks: Record<string, unknown>[] = [];
for (const [kind, fileBuffer] of [['digital', digitalPdf], ['scanned', scannedPdf]] as const) {
  const start = Date.now();
  const extracted = await extractDocumentSource({ fileBuffer, mimeType: 'application/pdf', fileName: `${kind}.pdf` });
  assert.equal(extracted.pageCount, 2);
  assert.equal(extracted.extractionMethod, kind === 'digital' ? 'pdf-parse' : 'tesseract-ocr');
  assert.match(extracted.normalizedText, /Morgan Vale/);
  assert.match(extracted.normalizedText, /SYN-772/);
  assert.match(extracted.normalizedText, /Acetaminophen 500 mg/);
  assert.match(extracted.normalizedText, /Atorvastatin 40 mg/);
  assert.ok(extracted.normalizedText.indexOf('Morgan Vale') < extracted.normalizedText.indexOf('Acetaminophen'));
  sourceChecks.push({ kind, pages: 2, method: extracted.extractionMethod, sourceMs: Date.now() - start });
}
const oversized = new jsPDF();
for (let i = 1; i < 21; i++) oversized.addPage();
await assert.rejects(() => extractDocumentSource({ fileBuffer: Buffer.from(oversized.output('arraybuffer')), mimeType: 'application/pdf' }), /20 pages/);
console.log('PASS: digital/scanned PDF reading preserves both pages in order; 21 pages rejected.');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'discharge-pdf-upload-'));
const port = '3308';
const base = `http://127.0.0.1:${port}`;
let occupied = false;
try { await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) }); occupied = true; } catch {}
assert.equal(occupied, false, 'PDF upload test port is already occupied.');
const child = spawn(process.execPath, ['dist/server.js'], {
  windowsHide: true, detached: process.platform !== 'win32', stdio: 'ignore',
  env: { ...process.env, NODE_ENV: 'production', PORT: port, DATA_PATH: path.join(directory, 'test.sqlite'), APP_USERNAME: 'synthetic-pdf', APP_PASSWORD: 'synthetic-pdf-test-password', CLOUD_PROCESSING_ENABLED: 'false', GEMINI_AUDIT_ENABLED: 'false', GEMINI_GENERATION_ENABLED: 'false' },
});
const auth = 'Basic ' + Buffer.from('synthetic-pdf:synthetic-pdf-test-password').toString('base64');
const uploads: Record<string, unknown>[] = [];
try {
  const until = Date.now() + 45_000;
  while (true) {
    assert.equal(child.exitCode, null, 'PDF test server exited before readiness.');
    try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) })).ok) break; } catch {}
    assert.ok(Date.now() < until, 'PDF test server readiness timed out.');
    await delay(200);
  }
  for (const [kind, bytes] of [['digital-cold-model', digitalPdf], ['scanned-warm-model', scannedPdf]] as const) {
    const start = Date.now();
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/pdf' }), `${kind}.pdf`);
    const response = await fetch(base + '/api/extract-discharge', { method: 'POST', headers: { Authorization: auth }, body: form, signal: AbortSignal.timeout(180_000) });
    assert.equal(response.status, 200, `${kind} PDF upload failed`);
    const data = await response.json();
    assert.equal(data.patient.name.value, 'Morgan Vale');
    assert.equal(data.patient.patientId.value, 'SYN-772');
    assert.ok(data.medications.some((med: { name: string; dosage: string }) => med.name.toLowerCase() === 'acetaminophen' && /^500\s*mg$/i.test(med.dosage)));
    assert.equal(data.extractionMetadata.geminiApiCalls, 0);
    assert.match(data.extractionMetadata.extractionMethod, kind.startsWith('digital') ? /^pdf-parse/ : /^tesseract-ocr/);
    const latency = data.extractionMetadata.latency;
    assert.ok(latency.sourceMs >= 0 && latency.modelMs > 0 && latency.totalMs >= latency.sourceMs + latency.modelMs);
    const result = { kind, pages: 2, wallMs: Date.now() - start, ...latency };
    uploads.push(result);
    console.log('PASS: multipart PDF upload, both-page clinical fields, no cloud:', JSON.stringify(result));
  }
  fs.mkdirSync('.runtime', { recursive: true });
  fs.writeFileSync('.runtime/pdf-upload-timings.json', JSON.stringify({ sourceChecks, uploads, note: 'Two synthetic PDFs; sequential cold digital and warm scanned runs, not a controlled speed comparison or the user document.' }, null, 2));
} finally {
  if (child.pid && child.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  }
}
