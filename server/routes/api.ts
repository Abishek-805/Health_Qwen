import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  checkGeminiStatus,
  generateReport,
  regenerateSectionAi,
} from '../ai/geminiService';
import { extractDocumentSource } from '../services/documentSourceService.js';
import { extractClinicalDataLocal, getQwenStatus } from '../services/localClinicalExtractionService.js';
import { mapCanonicalToStructured } from '../services/clinicalExtractionService.js';
import { validateSourceEvidence } from '../services/sourceEvidenceValidator.js';
import { executeHybridAudit } from '../audit/hybridAudit';
import { documentRepository } from '../repositories/documentRepository';
import { generateApprovedDischargePdf } from '../services/serverPdfGenerator';
import {
  AuthoritativeDischargeData,
  DischargeDocument,
  GeneratedReport,
  SupportedLanguage,
} from '../../src/types/discharge';

const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

export const apiRouter = Router();

// GET /api/health
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Healthcare Discharge Instructions Generator API',
  });
});

// GET /api/ai-status
apiRouter.get('/ai-status', async (req: Request, res: Response) => {
  const status = await checkGeminiStatus();
  res.json(status);
});

// GET /api/extraction-status
apiRouter.get('/extraction-status', async (req: Request, res: Response) => {
  const status = await getQwenStatus();
  res.json(status);
});

// GET /api/settings
apiRouter.get('/settings', (req: Request, res: Response) => {
  res.json(documentRepository.getSettings());
});

// PUT /api/settings
apiRouter.put('/settings', (req: Request, res: Response) => {
  const updated = documentRepository.updateSettings(req.body);
  res.json(updated);
});

// GET /api/patients
apiRouter.get('/patients', (req: Request, res: Response) => {
  res.json(documentRepository.getAllPatients());
});

// POST /api/extract-discharge
apiRouter.post('/extract-discharge', upload.single('file'), async (req: Request, res: Response) => {
  const startTotal = Date.now();
  try {
    const textInput = req.body.textInput;
    const file = req.file;

    if (!file && !textInput) {
      res.status(400).json({ error: 'Please upload a file (PDF/JPG/PNG) or paste clinical text.' });
      return;
    }

    const payload = {
      fileBuffer: file?.buffer,
      mimeType: file?.mimetype,
      fileName: file?.originalname,
      textInput,
    };

    // 1. Local Source Extraction & Text Normalization
    const startSource = Date.now();
    const sourceResult = await extractDocumentSource(payload);
    const documentPreparationMs = Date.now() - startSource;

    // PREVENT EMPTY/GARBLED OCR TEXT FROM REACHING QWEN (Generic OCR Quality Gate Assertion)
    if (
      !sourceResult.normalizedText ||
      sourceResult.normalizedText.trim().length < 30 ||
      sourceResult.ocrQuality?.qualityStatus === 'UNUSABLE'
    ) {
      console.error(
        `[EXTRACTION ABORTED] Insufficient or garbled OCR text extracted (${sourceResult.normalizedText?.length || 0} chars, quality=${sourceResult.ocrQuality?.qualityStatus || 'UNUSABLE'}). Aborting Qwen call to prevent hallucination.`
      );
      res.status(422).json({
        error: 'OCR_QUALITY_UNUSABLE',
        message: 'Unable to extract readable text from this document due to low image quality or text garbling. Please upload a clearer PDF or image.',
        ocrQuality: sourceResult.ocrQuality,
      });
      return;
    }

    // 2. Single Local Qwen Semantic Clinical Extraction (0 Gemini API calls)
    const startQwen = Date.now();
    const extractionResult = await extractClinicalDataLocal(sourceResult.normalizedText);
    const qwenInferenceMs = Date.now() - startQwen;

    // 3. Smart Source Evidence Validation (0 LLM API calls)
    const startVal = Date.now();
    const validatedResult = validateSourceEvidence(
      extractionResult.data,
      sourceResult.originalText
    );
    const evidenceValidationMs = Date.now() - startVal;
    const totalMs = Date.now() - startTotal;

    const extractionMetadata = {
      extractedAt: new Date().toISOString(),
      sourceFileType: sourceResult.sourceType,
      sourceFileName: file?.originalname || 'Pasted Clinical Text',
      extractionMethod: `${sourceResult.extractionMethod} + qwen2.5-1.5b-local`,
      ocrQuality: sourceResult.ocrQuality,
      totalFieldsExtracted: validatedResult.validationSummary.totalFieldsChecked,
      foundCount: validatedResult.validationSummary.verifiedCount,
      missingCount: validatedResult.validationSummary.missingCount,
      unclearCount: validatedResult.validationSummary.unclearCount,
      geminiApiCalls: 0,
      benchmarkMetrics: extractionResult.metrics,
      latency: {
        documentPreparationMs,
        qwenInferenceMs,
        evidenceValidationMs,
        totalMs,
      },
    };

    const structuredResult = mapCanonicalToStructured(
      validatedResult.data,
      extractionMetadata
    );

    res.json(structuredResult);
  } catch (err: any) {
    console.error('Extract discharge API error:', err);

    const message = err?.message || 'Clinical extraction failed. Please retry.';

    res.status(500).json({
      error: 'CLINICAL_EXTRACTION_FAILED',
      message,
    });
  }
});


// POST /api/generate-instructions
apiRouter.post('/generate-instructions', async (req: Request, res: Response) => {
  try {
    const { verifiedData, language, documentId, currentVersion } = req.body;

    if (!verifiedData || !verifiedData.patient) {
      res.status(400).json({ error: 'Verified authoritative patient data is required.' });
      return;
    }

    const version = (currentVersion || 0) + 1;
    const lang: SupportedLanguage = language || 'en';

    const report = await generateReport(verifiedData as AuthoritativeDischargeData, lang, version);

    // Automatically trigger fresh 18-category hybrid audit for the generated report
    const auditResult = await executeHybridAudit(verifiedData, report);

    if (documentId) {
      const existingDoc = documentRepository.getDocumentById(documentId);
      if (existingDoc) {
        const history = existingDoc.reportHistory || [];
        if (existingDoc.generatedReport) {
          history.push(existingDoc.generatedReport);
        }

        documentRepository.updateDocument(documentId, {
          verifiedData,
          generatedReport: report,
          currentVersion: version,
          reportHistory: history,
          auditResult,
          auditHistory: [auditResult, ...(existingDoc.auditHistory || [])],
          approvalStatus: auditResult.overallStatus === 'CRITICAL_ISSUE' ? 'NEEDS_REVIEW' : 'AUDITED',
        });
      }
    }

    res.json({
      report,
      auditResult,
    });
  } catch (err: any) {
    console.error('Generate instructions API error:', err);
    res.status(500).json({ error: err?.message || 'Report generation failed' });
  }
});

// POST /api/validate-instructions & POST /api/audit-instructions
const handleAudit = async (req: Request, res: Response) => {
  try {
    const { verifiedData, report, documentId } = req.body;

    if (!verifiedData || !report) {
      res.status(400).json({ error: 'Both verified patient data and generated report are required for audit.' });
      return;
    }

    const auditResult = await executeHybridAudit(verifiedData, report);

    if (documentId) {
      const existingDoc = documentRepository.getDocumentById(documentId);
      if (existingDoc) {
        documentRepository.updateDocument(documentId, {
          auditResult,
          auditHistory: [auditResult, ...(existingDoc.auditHistory || [])],
        });
      }
    }

    res.json(auditResult);
  } catch (err: any) {
    console.error('Validate/Audit instructions API error:', err);
    res.status(500).json({ error: err?.message || 'Audit execution failed' });
  }
};

apiRouter.post('/validate-instructions', handleAudit);
apiRouter.post('/audit-instructions', handleAudit);

// POST /api/regenerate-section
apiRouter.post('/regenerate-section', async (req: Request, res: Response) => {
  try {
    const { verifiedData, sectionKey, currentText, instruction, language, documentId, currentReport } = req.body;

    if (!verifiedData || !sectionKey || !instruction) {
      res.status(400).json({ error: 'Missing required parameters for section regeneration.' });
      return;
    }

    const updatedSectionText = await regenerateSectionAi(
      verifiedData,
      sectionKey,
      currentText || '',
      instruction,
      language || 'en'
    );

    let updatedReport: GeneratedReport | null = null;

    if (currentReport) {
      const nextVersion = currentReport.version + 1;
      updatedReport = {
        ...currentReport,
        version: nextVersion,
        sections: {
          ...currentReport.sections,
          [sectionKey]: updatedSectionText,
        },
        generatedAt: new Date().toISOString(),
      };

      // Fresh Audit for the modified report version!
      const freshAudit = await executeHybridAudit(verifiedData, updatedReport);

      if (documentId) {
        const existingDoc = documentRepository.getDocumentById(documentId);
        if (existingDoc) {
          const history = existingDoc.reportHistory || [];
          if (existingDoc.generatedReport) {
            history.push(existingDoc.generatedReport);
          }
          documentRepository.updateDocument(documentId, {
            generatedReport: updatedReport,
            currentVersion: nextVersion,
            reportHistory: history,
            auditResult: freshAudit,
            auditHistory: [freshAudit, ...(existingDoc.auditHistory || [])],
            approvalStatus: 'AUDITED',
          });
        }
      }

      res.json({
        updatedSectionText,
        updatedReport,
        freshAudit,
      });
      return;
    }

    res.json({ updatedSectionText });
  } catch (err: any) {
    console.error('Regenerate section API error:', err);
    res.status(500).json({ error: err?.message || 'Section regeneration failed' });
  }
});

// GET /api/documents & GET /api/discharge-documents
const handleGetDocuments = (req: Request, res: Response) => {
  res.json(documentRepository.getAllDocuments());
};
apiRouter.get('/documents', handleGetDocuments);
apiRouter.get('/discharge-documents', handleGetDocuments);

// POST /api/documents & POST /api/discharge-documents
const handleCreateDocument = (req: Request, res: Response) => {
  try {
    const newDoc: DischargeDocument = {
      id: req.body.id || `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      patientId: req.body.patientId || 'PAT-TEMP',
      patientName: req.body.patientName || req.body.verifiedData?.patient?.name?.value || 'Unspecified Patient',
      uploadedFileName: req.body.uploadedFileName || 'Document.pdf',
      uploadedFileType: req.body.uploadedFileType || 'pdf',
      uploadedAt: req.body.createdAt || new Date().toISOString(),
      currentVersion: req.body.currentVersion || 1,
      approvalStatus: req.body.approvalStatus || 'DRAFT',
      reportHistory: req.body.reportHistory || [],
      auditHistory: req.body.auditHistory || [],
      createdAt: req.body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extractedInfo: req.body.extractedInfo || req.body.rawExtractedData,
      rawExtractedData: req.body.rawExtractedData,
      verifiedData: req.body.verifiedData,
      generatedReport: req.body.generatedReport,
      auditResult: req.body.auditResult,
      // Preserve clinician approval metadata — required by the official PDF gate
      approvedBy: req.body.approvedBy,
      hospitalInfo: req.body.hospitalInfo || {
        name: documentRepository.getSettings().hospitalName,
        department: documentRepository.getSettings().department,
      },
    };

    const saved = documentRepository.createDocument(newDoc);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create document' });
  }
};
apiRouter.post('/documents', handleCreateDocument);
apiRouter.post('/discharge-documents', handleCreateDocument);

// GET /api/documents/:id & GET /api/discharge-documents/:id
const handleGetDocumentById = (req: Request, res: Response) => {
  const doc = documentRepository.getDocumentById(req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json(doc);
};
apiRouter.get('/documents/:id', handleGetDocumentById);
apiRouter.get('/discharge-documents/:id', handleGetDocumentById);

// PUT /api/documents/:id & PUT /api/discharge-documents/:id
const handleUpdateDocument = (req: Request, res: Response) => {
  const updated = documentRepository.updateDocument(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json(updated);
};
apiRouter.put('/documents/:id', handleUpdateDocument);
apiRouter.put('/discharge-documents/:id', handleUpdateDocument);


// POST /api/approve-instructions & POST /api/approve-document
const handleApproveInstructions = (req: Request, res: Response) => {
  try {
    const { documentId, reviewerName, reviewerRole, signatureNote } = req.body;

    if (!documentId) {
      res.status(400).json({ error: 'documentId is required.' });
      return;
    }

    if (!reviewerName || !reviewerRole) {
      res.status(400).json({ error: 'Reviewer name and role are required for clinical sign-off.' });
      return;
    }

    const doc = documentRepository.getDocumentById(documentId);
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    if (!doc.generatedReport) {
      res.status(400).json({ error: 'Cannot approve document without a generated report.' });
      return;
    }

    if (!doc.auditResult) {
      res.status(400).json({ error: 'Cannot approve document without a completed safety audit.' });
      return;
    }

    // MANDATORY BACKEND SAFETY CHECK: Audit version MUST match current report version
    if (doc.auditResult.reportVersion !== doc.generatedReport.version) {
      res.status(400).json({
        error: `STALE AUDIT ERROR: Current audit (v${doc.auditResult.reportVersion}) does not match current report version (v${doc.generatedReport.version}). Please rerun audit on current version before approval.`,
      });
      return;
    }

    // MANDATORY BACKEND SAFETY CHECK: CRITICAL_ISSUE strictly blocks approval!
    if (doc.auditResult.overallStatus === 'CRITICAL_ISSUE') {
      res.status(403).json({
        error: 'CRITICAL_AUDIT_BLOCK',
        message: 'APPROVAL BLOCKED: Current document has CRITICAL_ISSUE audit findings. All critical mismatches must be resolved prior to approval.',
      });
      return;
    }

    const approvalData = {
      name: reviewerName,
      role: reviewerRole,
      timestamp: new Date().toISOString(),
      signatureNote: signatureNote || 'Verified and approved by attending healthcare professional.',
    };

    const updated = documentRepository.updateDocument(documentId, {
      approvalStatus: 'APPROVED',
      approvedBy: approvalData,
    });

    res.json({
      success: true,
      document: updated,
      message: `Discharge Instructions approved successfully by ${reviewerName} (${reviewerRole}).`,
    });
  } catch (err: any) {
    console.error('Approve instructions API error:', err);
    res.status(500).json({ error: err?.message || 'Approval failed' });
  }
};

apiRouter.post('/approve-instructions', handleApproveInstructions);
apiRouter.post('/approve-document', handleApproveInstructions);

// POST /api/generate-approved-pdf
// ════════════════════════════════════════════════════════════════
// The ONE authoritative PDF download endpoint.
// Returns the PDF binary via HTTP Content-Disposition headers.
// Chrome uses the HTTP headers (not blob URLs) for the filename.
//
// POST /api/precheck-approved-pdf
// Same validation, JSON-only, no PDF generated. Lets the frontend
// surface server-side errors BEFORE triggering the native form POST
// download (a failed form POST would navigate the page to an error).
// ════════════════════════════════════════════════════════════════

/** Resolve the DischargeDocument from JSON body, urlencoded form payload, or documentId. */
function resolvePdfDocument(req: Request): DischargeDocument | null {
  if (req.body?.verifiedData) {
    return req.body as DischargeDocument;
  }
  if (req.body?.payload) {
    try {
      return typeof req.body.payload === 'string' ? JSON.parse(req.body.payload) : req.body.payload;
    } catch {
      return null;
    }
  }
  if (req.query?.documentId || req.body?.documentId) {
    const docId = (req.query.documentId || req.body.documentId) as string;
    return documentRepository.getDocumentById(docId) || null;
  }
  return null;
}

/** Server-side validation — do not trust frontend state. Returns error tuple or null when valid. */
function validateApprovedPdfDocument(doc: DischargeDocument | null): { status: number; code: string; message: string } | null {
  if (!doc) {
    return { status: 400, code: 'INVALID_DOCUMENT_PAYLOAD', message: 'Valid DischargeDocument payload is required.' };
  }
  if (!doc.verifiedData) {
    return { status: 400, code: 'MISSING_VERIFIED_DATA', message: 'verifiedData is required.' };
  }
  if (!doc.generatedReport) {
    return { status: 400, code: 'MISSING_REPORT', message: 'generatedReport is required.' };
  }
  if (!doc.auditResult) {
    return { status: 400, code: 'MISSING_AUDIT', message: 'auditResult is required.' };
  }
  if (doc.auditResult.overallStatus === 'CRITICAL_ISSUE') {
    return {
      status: 403,
      code: 'CRITICAL_AUDIT_BLOCK',
      message: 'Cannot generate official PDF with unresolved critical safety issues.',
    };
  }
  if (!doc.approvedBy) {
    return { status: 400, code: 'MISSING_APPROVAL', message: 'approvedBy metadata is required.' };
  }
  return null;
}

// POST /api/precheck-approved-pdf — JSON validation gate, never returns a PDF.
apiRouter.post('/precheck-approved-pdf', (req: Request, res: Response) => {
  const error = validateApprovedPdfDocument(resolvePdfDocument(req));
  if (error) {
    res.status(error.status).json({ code: error.code, message: error.message });
    return;
  }
  res.json({ ok: true, code: 'READY_FOR_OFFICIAL_PDF' });
});

const handleGenerateApprovedPdf = (req: Request, res: Response) => {
  try {
    const error = validateApprovedPdfDocument(resolvePdfDocument(req));
    if (error) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }

    // Generate the PDF server-side
    const doc = resolvePdfDocument(req) as DischargeDocument;
    const result = generateApprovedDischargePdf(doc);

    console.log(`[PDF_ENDPOINT] Generated: ${result.filename} (${result.buffer.length} bytes)`);

    // Send as HTTP attachment — Chrome uses these headers for the filename
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length.toString());
    res.status(200).send(result.buffer);
  } catch (err: any) {
    console.error('[PDF_ENDPOINT] Error:', err?.message);
    res.status(500).json({
      code: 'PDF_GENERATION_FAILED',
      message: err?.message || 'Server-side PDF generation failed.',
    });
  }
};

// The EXACTLY ONE official production PDF download route.
apiRouter.post('/generate-approved-pdf', handleGenerateApprovedPdf);
