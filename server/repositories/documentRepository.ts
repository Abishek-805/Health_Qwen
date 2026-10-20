import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DischargeDocument, PatientRecord, SystemSettings } from '../../src/types/discharge';

const filename = process.env.DATA_PATH || path.resolve('data', 'discharge.sqlite');
if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
const database = new DatabaseSync(filename);
if (filename !== ':memory:' && process.platform !== 'win32') fs.chmodSync(filename, 0o600);
const schemaVersion = database.prepare('PRAGMA user_version').get() as { user_version: number };
if (schemaVersion.user_version > 1) throw new Error('Database schema is newer than this app; do not downgrade the application.');
database.exec(`PRAGMA user_version=1; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, document_id TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'History is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'History is append-only'); END;`);
const defaults: SystemSettings = {
  hospitalName: 'Local healthcare workspace', department: '', logoUrl: '', defaultLanguage: 'en',
  safetyConfiguration: { strictAuditMode: true, requireApprovalForLowSeverity: true, autoRegenerateOnCritical: false },
  clinicianInfo: { name: '', role: 'Clinician', licenseNumber: '' },
};

function decode(row: any): DischargeDocument | undefined { return row ? JSON.parse(row.data) : undefined; }
function save(doc: DischargeDocument, action: string, expectedVersion: number) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const current = decode(database.prepare('SELECT data FROM documents WHERE id=?').get(doc.id));
    if ((current?.currentVersion || 0) !== expectedVersion) throw Object.assign(new Error('Document changed. Reload before saving or approving.'), { code: 'DOCUMENT_CONFLICT' });
    database.prepare('INSERT INTO documents VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(doc.id, JSON.stringify(doc));
    database.prepare('INSERT INTO events(document_id, action, at, data) VALUES (?, ?, ?, ?)').run(doc.id, action, new Date().toISOString(), JSON.stringify({ ...doc, reportHistory: undefined, auditHistory: undefined }));
    database.exec('COMMIT');
    return structuredClone(doc);
  } catch (error) { database.exec('ROLLBACK'); throw error; }
}

export const documentRepository = {
  getAllDocuments(): DischargeDocument[] { return database.prepare('SELECT data FROM documents ORDER BY rowid DESC').all().map(decode) as DischargeDocument[]; },
  getDocumentById(id: string): DischargeDocument | undefined { return decode(database.prepare('SELECT data FROM documents WHERE id=?').get(id)); },
  createDocument(doc: DischargeDocument): DischargeDocument {
    if (this.getDocumentById(doc.id)) throw new Error('Document already exists.');
    return save(doc, 'created', 0);
  },
  updateDocument(id: string, updates: Partial<DischargeDocument>, expectedVersion?: number): DischargeDocument | undefined {
    const existing = this.getDocumentById(id);
    if (!existing) return undefined;
    return save({ ...existing, ...updates, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }, updates.approvalStatus === 'APPROVED' ? 'approved' : 'updated', expectedVersion ?? existing.currentVersion ?? 0);
  },
  getAllPatients(): PatientRecord[] {
    const patients = new Map<string, PatientRecord>();
    for (const doc of this.getAllDocuments()) {
      const current = patients.get(doc.patientId);
      if (current) { current.documentCount++; continue; }
      const data = doc.verifiedData || doc.rawExtractedData || doc.extractedInfo;
      patients.set(doc.patientId, {
        patientId: doc.patientId, name: data?.patient.name.value || doc.patientName || 'Unspecified',
        age: data?.patient.age.value || '', gender: data?.patient.gender.value || '',
        primaryDiagnosis: data?.diagnosis[0]?.value || '', lastDischargeDate: doc.updatedAt.slice(0, 10),
        documentCount: 1, status: doc.approvalStatus === 'APPROVED' ? 'DISCHARGED' : 'PENDING_REVIEW',
      });
    }
    return [...patients.values()];
  },
  getPatientById(id: string): PatientRecord | undefined { return this.getAllPatients().find(patient => patient.patientId === id); },
  getSettings(): SystemSettings {
    const row = database.prepare('SELECT data FROM settings WHERE id=1').get() as { data: string } | undefined;
    return row ? JSON.parse(row.data) : structuredClone(defaults);
  },
  updateSettings(settings: Partial<SystemSettings>): SystemSettings {
    const updated = { ...this.getSettings(), ...settings };
    database.prepare('INSERT INTO settings VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(updated));
    return updated;
  },
  backup(destination: string) { database.prepare('VACUUM INTO ?').run(path.resolve(destination)); },
};
