import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mockApprovedDoc } from './fixtures/pdfTestDocument';
import { PDFParse } from 'pdf-parse';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'discharge-production-'));
const development = process.argv.includes('--development');
const port = process.env.SMOKE_PORT || (development ? '3304' : '3303');
const base = `http://127.0.0.1:${port}`;
const username = 'synthetic-reviewer', password = 'synthetic-test-password-only';
const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
fs.mkdirSync('.runtime', { recursive: true });
const sentinel = 'SYNTHETIC_PRIVATE_FILE_MUST_NOT_BE_SERVED';
const probes = ['.runtime', 'data', 'models'].map(folder => {
  fs.mkdirSync(folder, { recursive: true });
  const probe = path.resolve(folder, 'http-private-probe-' + randomUUID() + '.txt');
  fs.writeFileSync(probe, sentinel, { flag: 'wx' });
  return probe;
});
let child: ReturnType<typeof spawn> | undefined;
async function stop() {
  if (!child?.pid) return;
  const owned = child;
  child = undefined;
  if (owned.exitCode !== null || owned.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(owned.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-owned.pid!, 'SIGTERM'); } catch {} }
  if (owned.exitCode === null) await Promise.race([once(owned, 'exit'), delay(5000, undefined, { ref: false })]);
}
process.on('SIGINT', async () => { await stop(); process.exit(0); });
process.on('SIGTERM', async () => { await stop(); process.exit(0); });
async function start() {
  child = spawn(development ? process.execPath : process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm', development ? ['--import', 'tsx', 'server.ts'] : process.platform === 'win32' ? ['/d', '/c', 'npm', 'start'] : ['start'], {
    detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: port, NODE_ENV: 'development', DATA_PATH: path.join(directory, 'test.sqlite'), APP_USERNAME: username, APP_PASSWORD: password,
      CLOUD_PROCESSING_ENABLED: 'false', GEMINI_AUDIT_ENABLED: 'false', GEMINI_GENERATION_ENABLED: 'false' },
  });
  let diagnostics = '';
  child.stdout?.on('data', chunk => { diagnostics = (diagnostics + String(chunk)).slice(-16_000); });
  child.stderr?.on('data', chunk => { diagnostics = (diagnostics + String(chunk)).slice(-16_000); });
  const readyUntil = Date.now() + 45_000;
  while (Date.now() < readyUntil) {
    if (child.exitCode !== null) throw new Error('Production process exited before readiness.');
    try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await delay(200);
  }
  fs.writeFileSync(path.join(directory, 'startup-diagnostics.log'), diagnostics);
  throw new Error('Production readiness timed out; synthetic startup diagnostics retained with the temporary database.');
}
async function request(endpoint: string, body?: unknown, options: RequestInit = {}) {
  return fetch(base + endpoint, { method: body === undefined ? 'GET' : 'POST', ...options, headers: { Authorization: auth, 'Content-Type': 'application/json', ...options.headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
try {
  // Refuse to mistake a pre-existing server for this test's process.
  let occupied = false; try { await fetch(base + '/api/health'); occupied = true; } catch {}
  assert.equal(occupied, false, 'Choose an unused SMOKE_PORT.');
  await start();
  assert.equal((await fetch(base + '/')).status, 401);
  const html = await (await request('/')).text();
  if (development) assert.match(html, /@vite\/client/);
  else { assert.match(html, /\/assets\/index-[\w-]+\.js/); assert.doesNotMatch(html, /@vite\/client/); }
  const asset = development ? '/src/main.tsx' : html.match(/src="([^\"]+\.js)"/)![1]; assert.equal((await request(asset)).status, 200);
  for (const probe of probes) {
    const relativeProbe = '/' + path.relative(process.cwd(), probe).replace(/\\/g, '/');
    const encodedProbe = relativeProbe.replace(/^\/([^/])/, (_match, character) => '/%' + character.charCodeAt(0).toString(16));
    for (const url of [relativeProbe, '/@fs/' + probe.replace(/\\/g, '/'), encodedProbe]) {
      const privateResponse = await request(url);
      if (development) assert.equal(privateResponse.status, 403);
      assert.ok(!(await privateResponse.text()).includes(sentinel), 'Private runtime file was served over HTTP');
    }
  }
  assert.equal((await request('/api/settings', undefined, { headers: { Origin: 'null' } })).status, 403);
  const verifiedData = structuredClone(mockApprovedDoc.verifiedData!);
  verifiedData.medications[0].instructions = '';
  verifiedData.medications[0].instructionsStatus = 'MISSING';
  verifiedData.medications.push({ ...verifiedData.medications[0], id: 'schedule-echo', name: 'Cefuroxime 500 mg twice daily for 5 days', instructions: 'for 5 days', instructionsStatus: 'FOUND' });
  const generatedResponse = await request('/api/generate-instructions', { verifiedData }); assert.equal(generatedResponse.status, 200);
  const generatedReport = (await generatedResponse.json()).report;
  const saveResponse = await request('/api/discharge-documents', { verifiedData, generatedReport, hospitalInfo: { name: 'Synthetic evaluation workspace', department: 'Synthetic' } });
  assert.equal(saveResponse.status, 201); let doc = await saveResponse.json();
  const damaged = structuredClone(doc.generatedReport);
  damaged.sections.medicationInstructions += '\nDo not take Cefuroxime 1000 mg once daily.';
  let update = await request('/api/discharge-documents/' + doc.id, { verifiedData, generatedReport: damaged, hospitalInfo: { name: 'Synthetic Hospital', department: 'General' } }, { method: 'PUT', headers: { 'If-Match': String(doc.currentVersion) } });
  assert.equal(update.status, 200); doc = await update.json();
  const finding = doc.auditResult.findings.find((item: { id: string }) => item.id === 'det-med-context-0');
  assert.ok(finding);
  const staleRepair = await request('/api/repair-instructions', { documentId: doc.id, reportVersion: doc.currentVersion - 1, findingId: finding.id });
  assert.equal(staleRepair.status, 409);
  const repair = await request('/api/repair-instructions', { documentId: doc.id, reportVersion: doc.currentVersion, findingId: finding.id });
  assert.equal(repair.status, 200); const preview = await repair.json();
  assert.equal(preview.removedDuplicateCount, 1);
  assert.equal(preview.verifiedData.medications.length, 1);
  assert.equal(preview.auditResult.findings.some((item: { id: string }) => item.id === finding.id), false);
  const unchanged = await (await request('/api/discharge-documents/' + doc.id)).json();
  assert.equal(unchanged.currentVersion, doc.currentVersion);
  assert.equal(unchanged.verifiedData.medications.length, 2);
  assert.match(unchanged.generatedReport.sections.medicationInstructions, /1000 mg/);
  update = await request('/api/discharge-documents/' + doc.id, { verifiedData: preview.verifiedData, generatedReport: preview.report, hospitalInfo: { name: 'Synthetic Hospital', department: 'General' } }, { method: 'PUT', headers: { 'If-Match': String(doc.currentVersion) } });
  assert.equal(update.status, 200); doc = await update.json();
  assert.notEqual(doc.approvalStatus, 'APPROVED');
  assert.equal(doc.verifiedData.medications.length, 1);
  assert.equal(doc.currentVersion, unchanged.currentVersion + 1);
  assert.equal(doc.auditResult.findings.some((item: { id: string }) => item.id === finding.id), false);
  const approval = await request('/api/approve-instructions', { documentId: doc.id, reportVersion: doc.currentVersion, clinicianReviewConfirmed: true });
  assert.equal(approval.status, 200); doc = (await approval.json()).document; assert.equal(doc.approvedBy.name, username);
  const pre = await request('/api/precheck-approved-pdf', { documentId: doc.id }); assert.equal(pre.status, 200);
  const pdf = await fetch(base + '/api/generate-approved-pdf', { method: 'POST', headers: { Authorization: auth, Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ documentId: doc.id }) });
  assert.equal(pdf.status, 200); assert.match(pdf.headers.get('content-type')!, /application\/pdf/);
  const parser = new PDFParse({ data: Buffer.from(await pdf.arrayBuffer()) });
  try { const { text } = await parser.getText(); assert.match(text, /Cefuroxime/); assert.match(text, /CLN-70428/); } finally { await parser.destroy(); }
  await stop(); await start();
  assert.equal((await (await request('/api/discharge-documents/' + doc.id)).json()).approvalStatus, 'APPROVED');
  assert.equal((await (await request('/api/discharge-documents/' + doc.id)).json()).verifiedData.medications.length, 1);
  console.log(`PASS: ${development ? 'development middleware' : 'real npm start forces production assets'}; private-file denial, auth, origin, generation/save, source-backed repair preview/save and stale-version rejection, approval, native form PDF and restart persistence.`);
  if (process.argv.includes('--serve')) {
    console.log(`Synthetic-only browser fixture server ready at ${base}; interrupt this test to stop.`);
    await new Promise(() => {});
  }
} finally { await stop(); probes.forEach(probe => fs.unlinkSync(probe)); }
