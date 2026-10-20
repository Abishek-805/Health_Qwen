import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import http from 'node:http';
import { mockApprovedDoc } from './fixtures/pdfTestDocument';
import { runDeterministicAudit } from '../audit/deterministicAudit';
import { validateSourceEvidence } from '../services/sourceEvidenceValidator';
import { sha256File } from '../scripts/download-model';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'discharge-test-'));
process.env.DATA_PATH = path.join(temporary, 'test.sqlite');
process.env.APP_USERNAME = 'test-clinician';
process.env.APP_PASSWORD = 'test-password-with-32-characters';
process.env.GEMINI_AUDIT_ENABLED = 'false';
process.env.CLOUD_PROCESSING_ENABLED = 'false';
const auth = 'Basic ' + Buffer.from(process.env.APP_USERNAME + ':' + process.env.APP_PASSWORD).toString('base64');
const { apiRouter, apiErrorHandler } = await import('../routes/api');
const { documentRepository } = await import('../repositories/documentRepository');
const app = express();
app.use(express.json({ limit: '1mb' })); app.use(express.urlencoded({ extended: false })); app.use('/api', apiRouter); app.use(apiErrorHandler);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + (server.address() as any).port + '/api';
async function request(endpoint: string, body?: unknown, options: RequestInit = {}) {
  return fetch(base + endpoint, { method: body === undefined ? 'GET' : 'POST', ...options, headers: { Authorization: auth, 'Content-Type': 'application/json', ...options.headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const source = structuredClone(mockApprovedDoc.verifiedData!);
const report = structuredClone(mockApprovedDoc.generatedReport!);
report.sections.summary += ' Patient ID: CLN-70428.';
report.sections.additionalInstructions += ' Known allergy: Penicillin - rash.';
const payload = { verifiedData: source, generatedReport: report, hospitalInfo: mockApprovedDoc.hospitalInfo };

test('authentication, trust boundaries, saved approval lifecycle and persistence', async () => {
  try {
    assert.equal((await request('/documents', undefined, { headers: { Authorization: '' } })).status, 401);
    assert.equal((await request('/documents', undefined, { headers: { Authorization: 'Basic ' + Buffer.from('test-clinician:wrong-password').toString('base64') } })).status, 401);
    assert.equal((await request('/documents', undefined, { headers: { Origin: 'null' } })).status, 403);
    assert.equal((await request('/settings')).headers.get('referrer-policy'), 'same-origin');
    assert.equal((await request('/documents', undefined, { headers: { Origin: 'https://attacker.example' } })).status, 403);
    const hostileHost = await new Promise<number>(resolve => { http.get(base + '/documents', { headers: { Host: 'attacker.example', Authorization: auth } }, res => { res.resume(); resolve(res.statusCode!); }); });
    assert.equal(hostileHost, 403);
    assert.equal((await request('/documents', { ...payload, approvalStatus: 'APPROVED', approvedBy: mockApprovedDoc.approvedBy })).status, 400);
    assert.equal((await request('/generate-approved-pdf', mockApprovedDoc)).status, 400);
    assert.equal((await request('/documents', { ...payload, verifiedData: { patient: 'broken' } })).status, 400);
    const uncertain = structuredClone(payload); uncertain.verifiedData.medications[0].instructionsStatus = 'UNCLEAR';
    assert.equal((await request('/documents', uncertain)).status, 400);
    const generatedResponse = await request('/generate-instructions', { verifiedData: source });
    assert.equal(generatedResponse.status, 200);
    const generated = (await generatedResponse.json()).report;
    assert.ok(generated.sections.additionalInstructions.includes('Penicillin'));
    assert.ok(generated.sections.summary.includes('CLN-70428'));
    const created = await request('/documents', payload);
    assert.equal(created.status, 201, await created.clone().text());
    let doc = await created.json();
    assert.equal(doc.currentVersion, 1);
    assert.equal(doc.approvedBy, undefined);
    assert.equal(doc.auditResult.categorySummaries.WORDING.status, 'NOT_EVALUATED');
    assert.equal(doc.auditResult.passCount, Object.values(doc.auditResult.categorySummaries).filter((category: any) => category.status === 'PASS').length);
    assert.notEqual(doc.auditResult.overallStatus, 'CRITICAL_ISSUE', JSON.stringify(doc.auditResult.findings));
    assert.equal((await request('/approve-document', { documentId: doc.id })).status, 400);
    const approval = await request('/approve-document', { documentId: doc.id, reportVersion: doc.currentVersion, clinicianReviewConfirmed: true, reviewerName: 'Forged reviewer' });
    assert.equal(approval.status, 200, await approval.clone().text());
    doc = (await approval.json()).document;
    assert.equal(doc.approvedBy.name, 'test-clinician');
    const pdf = await request('/generate-approved-pdf', { documentId: doc.id });
    assert.equal(pdf.status, 200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    assert.equal((await request('/documents/' + doc.id, { ...payload, id: 'forged' }, { method: 'PUT', headers: { 'If-Match': String(doc.currentVersion) } })).status, 400);
    const updated = await request('/documents/' + doc.id, payload, { method: 'PUT', headers: { 'If-Match': String(doc.currentVersion) } });
    assert.equal(updated.status, 200); doc = await updated.json();
    assert.equal(doc.currentVersion, 2); assert.equal(doc.approvedBy, undefined);
    assert.equal(documentRepository.getAllPatients()[0].documentCount, 1);
    assert.equal((await request('/generate-approved-pdf', { documentId: doc.id })).status, 400);
    assert.equal((await request('/documents/' + doc.id, payload, { method: 'PUT', headers: { 'If-Match': '1' } })).status, 409);
    assert.equal((await request('/approve-document', { documentId: doc.id, reportVersion: 1, clinicianReviewConfirmed: true })).status, 409);
    const unsafe = structuredClone(payload); unsafe.generatedReport.sections.medicationInstructions = 'Cefuroxime 1000 mg twice daily for 500 days.';
    const critical = await request('/documents/' + doc.id, unsafe, { method: 'PUT', headers: { 'If-Match': String(doc.currentVersion) } });
    assert.equal(critical.status, 200); doc = await critical.json(); assert.equal(doc.auditResult.overallStatus, 'CRITICAL_ISSUE');
    assert.equal((await request('/approve-document', { documentId: doc.id, reportVersion: doc.currentVersion, clinicianReviewConfirmed: true })).status, 403);
    assert.equal((await request('/settings', { hospitalName: 'Test hospital', department: 'Test department' }, { method: 'PUT' })).status, 200);
    assert.equal((await (await request('/settings')).json()).hospitalName, 'Test hospital');
    assert.equal((await request('/regenerate-section', {})).status, 403);
    const form = new FormData(); form.append('file', new Blob(['not a real PDF'], { type: 'application/pdf' }), 'fake.pdf');
    assert.equal((await fetch(base + '/extract-discharge', { method: 'POST', headers: { Authorization: auth }, body: form })).status, 415);
    // A separate process reads committed data, proving it survives process boundaries.
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', "const {documentRepository:r}=await import('./server/repositories/documentRepository.ts'); if(r.getAllDocuments().length!==1||r.getSettings().hospitalName!=='Test hospital')process.exit(1);"], { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const backup = path.join(temporary, 'backup.sqlite'); documentRepository.backup(backup);
    const restoredPath = path.join(temporary, 'restored.sqlite');
    const restoreRun = spawnSync(process.execPath, ['--import', 'tsx', 'server/scripts/maintenance.ts', 'restore', backup, restoredPath], { env: process.env, encoding: 'utf8' });
    assert.equal(restoreRun.status, 0, restoreRun.stderr);
    const overwrite = spawnSync(process.execPath, ['--import', 'tsx', 'server/scripts/maintenance.ts', 'restore', backup, restoredPath], { env: process.env, encoding: 'utf8' });
    assert.notEqual(overwrite.status, 0);
    const restored = new DatabaseSync(restoredPath, { readOnly: true });
    assert.equal((restored.prepare('SELECT COUNT(*) AS n FROM documents').get() as any).n, 1);
    assert.ok((restored.prepare('SELECT COUNT(*) AS n FROM events').get() as any).n >= 4);
    assert.throws(() => restored.exec('DELETE FROM events')); restored.close();
    const live = new DatabaseSync(process.env.DATA_PATH!);
    assert.throws(() => live.exec('DELETE FROM events'), /append-only/); live.close();
    process.env.GEMINI_AUDIT_ENABLED = 'true';
    const { executeHybridAudit } = await import('../audit/hybridAudit');
    const cloudUnavailable = await executeHybridAudit(source, report);
    assert.equal(cloudUnavailable.cloudAuditStatus, 'unavailable');
    process.env.GEMINI_AUDIT_ENABLED = 'false';
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('dose comparisons bind the first quantity and its unit to the medication', () => {
  for (const dose of ['500 mg then 1000 mg twice daily', '1000 mg twice daily for 500 days', '500 mcg twice daily', '0.500 g twice daily', 'twice daily']) {
    const changed = structuredClone(report); changed.sections.medicationInstructions = 'Cefuroxime ' + dose;
    assert.ok(runDeterministicAudit(source, changed).some(finding => finding.id === 'det-med-dose-mismatch-0'), dose);
  }
  for (const [changed, id] of [['Cefuroxime 500 mg once daily for 5 days', 'det-med-frequency-mismatch-0'], ['Cefuroxime 500 mg twice daily for 10 days', 'det-med-duration-mismatch-0']] as const) {
    const altered = structuredClone(report); altered.sections.medicationInstructions = changed;
    assert.ok(runDeterministicAudit(source, altered).some(finding => finding.id === id));
  }
  assert.ok(!runDeterministicAudit(source, report).some(finding => finding.id === 'det-med-dose-mismatch-0'));
});

test('evidence cannot validate a different or unsupported value', async () => {
  const field = (value = '', evidence = value) => ({ value, evidence, status: 'FOUND' as const });
  const input = { patient: { name: field('Alice'), patientId: field('999', 'Patient ID: 123'), age: field('5', 'Age: 0.5'), gender: field() }, diagnoses: [], procedures: [], medications: [], allergies: [], dietaryInstructions: [], woundCare: [], activityRestrictions: [], followUpAppointments: [], warningSigns: [], emergencyInstructions: [] };
  const checked = validateSourceEvidence(input, 'Patient Alice. Patient ID: 123. Age: 0.5');
  assert.equal(checked.data.patient.patientId.status, 'UNCLEAR'); assert.equal(checked.data.patient.age.status, 'UNCLEAR');
  assert.equal(validateSourceEvidence(input, '').data.patient.name.status, 'UNCLEAR');
  const file = path.join(temporary, 'hash.txt'); fs.writeFileSync(file, 'abc');
  assert.equal(await sha256File(file), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
