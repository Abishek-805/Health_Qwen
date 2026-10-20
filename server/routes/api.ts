import { Router, type Request, type RequestHandler, type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { checkGeminiStatus, generateReport, regenerateSectionAi } from '../ai/geminiService';
import { extractDocumentSource } from '../services/documentSourceService';
import { extractClinicalDataLocal, getQwenStatus } from '../services/localClinicalExtractionService';
import { mapCanonicalToStructured } from '../services/clinicalExtractionService';
import { validateSourceEvidence } from '../services/sourceEvidenceValidator';
import { executeHybridAudit } from '../audit/hybridAudit';
import { AUDIT_POLICY_VERSION } from '../audit/deterministicAudit';
import { documentRepository } from '../repositories/documentRepository';
import { generateApprovedDischargePdf } from '../services/serverPdfGenerator';
import { authenticate, clinicianIdentity } from '../security';
import { HttpError, object, text, verified, report, hospital, sectionKeys } from '../validation';
import type { DischargeDocument, GeneratedReport } from '../../src/types/discharge';

const upload = multer({ limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 1, fieldSize: 32_000, parts: 2 } });
export const apiRouter = Router();
const route = (handler: (req: Request, res: any) => any): RequestHandler => (req, res, next) => { Promise.resolve().then(() => handler(req, res)).catch(next); };
apiRouter.get('/health', (_req, res) => res.json({ status: 'ok' }));
apiRouter.use(authenticate);
apiRouter.get('/session', (_req, res) => res.json(clinicianIdentity()));
apiRouter.get('/ai-status', route(async (_req, res) => res.json(await checkGeminiStatus())));
apiRouter.get('/extraction-status', (_req, res) => res.json(getQwenStatus()));
apiRouter.get('/settings', (_req, res) => res.json({ ...documentRepository.getSettings(), clinicianInfo: { ...clinicianIdentity(), licenseNumber: '' } }));
apiRouter.put('/settings', route((req, res) => {
  const input = object(req.body);
  if (Object.keys(input).some(key => !['hospitalName', 'department'].includes(key))) throw new HttpError(400, 'Only hospital name and department can be changed.');
  res.json(documentRepository.updateSettings({ hospitalName: text(input.hospitalName, 200, true), department: text(input.department, 200) }));
}));
apiRouter.get('/patients', (_req, res) => res.json(documentRepository.getAllPatients()));

let extracting = false;
apiRouter.post('/extract-discharge', (req, res, next) => {
  if (extracting) { res.status(429).json({ error: 'Extraction is busy. Retry after the current document finishes.' }); return; }
  extracting = true;
  res.once('finish', () => { extracting = false; });
  res.once('close', () => { if (!req.complete) extracting = false; });
  next();
}, upload.single('file'), route(async (req, res) => {
  try {
  const started = Date.now();
  const file = req.file;
  const textInput = req.body?.textInput === undefined ? undefined : text(req.body.textInput, 32_000, true);
  if ((!file && !textInput) || (file && textInput)) throw new HttpError(400, 'Upload one file or paste text.');
  if (file) {
    const b = file.buffer;
    const pdf = b.subarray(0, 5).toString() === '%PDF-';
    const png = b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
    if (!((pdf && file.mimetype === 'application/pdf') || (png && file.mimetype === 'image/png') || (jpeg && file.mimetype === 'image/jpeg'))) throw new HttpError(415, 'Only matching PDF, PNG, and JPEG file signatures are accepted.');
  }
  const source = await extractDocumentSource({ fileBuffer: file?.buffer, mimeType: file?.mimetype, fileName: file ? (file.mimetype === 'application/pdf' ? 'upload.pdf' : 'upload.png') : undefined, textInput });
  if (source.normalizedText.trim().length < 30 || source.ocrQuality?.qualityStatus === 'UNUSABLE') throw new HttpError(422, 'OCR_QUALITY_UNUSABLE: Upload a clearer document.');
  const extraction = await extractClinicalDataLocal(source.normalizedText);
  const checked = validateSourceEvidence(extraction.data, source.originalText);
  res.json(mapCanonicalToStructured(checked.data, { extractedAt: new Date().toISOString(), sourceFileType: source.sourceType, sourceFileName: file?.originalname || 'Pasted text', extractionMethod: source.extractionMethod + ' + qwen2.5-1.5b-local', ocrQuality: source.ocrQuality, totalFieldsExtracted: checked.validationSummary.totalFieldsChecked, foundCount: checked.validationSummary.verifiedCount, missingCount: checked.validationSummary.missingCount, unclearCount: checked.validationSummary.unclearCount, geminiApiCalls: 0, latency: { totalMs: Date.now() - started } }));
  } finally { extracting = false; }
}));

apiRouter.post('/generate-instructions', route(async (req, res) => {
  if (req.body.language && req.body.language !== 'en') throw new HttpError(400, 'Only English reports are supported.');
  const data = verified(req.body.verifiedData);
  const generated = await generateReport(data, 'en', 1);
  res.json({ report: generated, auditResult: await executeHybridAudit(data, generated) });
}));
const audit = route(async (req, res) => res.json(await executeHybridAudit(verified(req.body.verifiedData), report(req.body.report))));
apiRouter.post(['/audit-instructions', '/validate-instructions'], audit);
apiRouter.post('/regenerate-section', route(async (req, res) => {
  if (process.env.CLOUD_PROCESSING_ENABLED !== 'true' || process.env.GEMINI_GENERATION_ENABLED !== 'true') throw new HttpError(403, 'Cloud section regeneration is disabled. Edit the section manually.');
  const data = verified(req.body.verifiedData), current = report(req.body.report);
  if (!sectionKeys.includes(req.body.sectionKey)) throw new HttpError(400, 'Invalid report section.');
  const key = req.body.sectionKey as keyof GeneratedReport['sections'];
  const updatedSectionText = await regenerateSectionAi(data, key, current.sections[key], text(req.body.instruction, 2000, true), 'en');
  res.json({ updatedSectionText });
}));

const collection = ['/documents', '/discharge-documents'];
const individual = ['/documents/:id', '/discharge-documents/:id'];
apiRouter.get(collection, (_req, res) => res.json(documentRepository.getAllDocuments()));
apiRouter.get(individual, route((req, res) => res.json(requireDocument(req.params.id))));
function requireDocument(id: unknown): DischargeDocument {
  const doc = documentRepository.getDocumentById(text(id, 200, true));
  if (!doc) throw new HttpError(404, 'Document not found.');
  return doc;
}
const writable = ['verifiedData', 'generatedReport', 'hospitalInfo'];
const savesInProgress = new Set<string>();
async function saveDocument(req: Request, existing?: DischargeDocument) {
  const input = object(req.body);
  if (Object.keys(input).some(key => !writable.includes(key))) throw new HttpError(400, 'Only verifiedData, generatedReport and hospitalInfo are writable.');
  if (existing && req.get('If-Match') !== String(existing.currentVersion)) throw new HttpError(409, 'Document changed or expected version missing. Reload before saving.');
  const id = existing?.id || randomUUID();
  if (savesInProgress.has(id)) throw new HttpError(409, 'Document is being updated. Retry.');
  savesInProgress.add(id);
  try {
    const data = verified(input.verifiedData), generated = report(input.generatedReport);
    generated.id = existing?.generatedReport?.id || randomUUID();
    generated.version = (existing?.currentVersion || 0) + 1;
    const checked = await executeHybridAudit(data, generated);
    const now = new Date().toISOString();
    const doc: DischargeDocument = { id, patientId: data.patient.patientId.value, patientName: data.patient.name.value, verifiedData: data, generatedReport: generated,
      currentVersion: generated.version, auditResult: checked, approvalStatus: checked.overallStatus === 'CRITICAL_ISSUE' ? 'NEEDS_REVIEW' : 'AUDITED', approvedBy: undefined,
      reportHistory: [...(existing?.reportHistory || []), ...(existing?.generatedReport ? [existing.generatedReport] : [])],
      auditHistory: [...(existing?.auditHistory || []), checked], hospitalInfo: hospital(input.hospitalInfo), createdAt: existing?.createdAt || now, updatedAt: now };
    return existing ? documentRepository.updateDocument(id, doc, existing.currentVersion)! : documentRepository.createDocument(doc);
  } finally { savesInProgress.delete(id); }
}
apiRouter.post(collection, route(async (req, res) => res.status(201).json(await saveDocument(req))));
apiRouter.put(individual, route(async (req, res) => res.json(await saveDocument(req, requireDocument(req.params.id)))));
apiRouter.post(['/approve-instructions', '/approve-document'], route(async (req, res) => {
  const doc = requireDocument(req.body.documentId);
  if (savesInProgress.has(doc.id)) throw new HttpError(409, 'Wait for the document update.');
  if (req.body.clinicianReviewConfirmed !== true) throw new HttpError(400, 'Confirm that all clinical content and audit limitations have been reviewed.');
  if (req.body.reportVersion !== doc.currentVersion) throw new HttpError(409, 'Report changed. Reload and review the current version before approving.');
  if (!doc.generatedReport || !doc.verifiedData || !doc.auditResult || doc.auditResult.reportVersion !== doc.generatedReport.version) throw new HttpError(400, 'A current saved report and audit are required.');
  if (doc.auditResult.policyVersion !== AUDIT_POLICY_VERSION) throw new HttpError(409, 'Saved audit uses an older policy. Save, audit and review the report again before approval.');
  if (doc.auditResult.overallStatus === 'CRITICAL_ISSUE') throw new HttpError(403, 'CRITICAL_AUDIT_BLOCK');
  if (doc.auditResult.cloudAuditStatus === 'unavailable') throw new HttpError(403, 'The requested cloud audit did not complete. Retry the audit before approval.');
  if (doc.approvalStatus === 'APPROVED' && doc.approvedBy) { res.json({ success: true, document: doc }); return; }
  const signed = { ...clinicianIdentity(), timestamp: new Date().toISOString(), signatureNote: text(req.body.signatureNote || '', 2000) };
  const updated = documentRepository.updateDocument(doc.id, { approvalStatus: 'APPROVED', approvedBy: signed }, doc.currentVersion);
  res.json({ success: true, document: updated });
}));

function approvedPdf(req: Request): DischargeDocument {
  if (Object.keys(req.body || {}).some(key => key !== 'documentId')) throw new HttpError(400, 'Send only the saved documentId.');
  const doc = requireDocument(req.body.documentId);
  if (savesInProgress.has(doc.id)) throw new HttpError(409, 'Wait for the document update.');
  if (!doc.verifiedData || !doc.generatedReport || !doc.auditResult || !doc.approvedBy || doc.approvalStatus !== 'APPROVED') throw new HttpError(400, 'The saved document requires clinician approval.');
  if (doc.auditResult.policyVersion !== AUDIT_POLICY_VERSION) throw new HttpError(409, 'Saved audit uses an older policy. Save, audit and review the report again before export.');
  if (doc.auditResult.reportVersion !== doc.generatedReport.version || doc.currentVersion !== doc.generatedReport.version) throw new HttpError(409, 'The saved audit is stale.');
  if (doc.auditResult.overallStatus === 'CRITICAL_ISSUE' || doc.auditResult.cloudAuditStatus === 'unavailable') throw new HttpError(403, 'CRITICAL_AUDIT_BLOCK');
  return doc;
}
apiRouter.post('/precheck-approved-pdf', route((req, res) => { approvedPdf(req); res.json({ ok: true }); }));
apiRouter.post('/generate-approved-pdf', route((req, res) => {
  const result = generateApprovedDischargePdf(approvedPdf(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Length', result.buffer.length.toString());
  res.send(result.buffer);
}));
export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error instanceof HttpError ? error.status : error.code === 'DOCUMENT_CONFLICT' ? 409 : error instanceof RangeError ? 422 : error instanceof multer.MulterError || error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
  if (status === 500) console.error('Request failed:', error.code || error.name || 'Error');
  res.status(status).json({ error: status === 500 ? 'Operation failed. No successful save was confirmed; please retry.' : error.message });
};
apiRouter.use(apiErrorHandler);
