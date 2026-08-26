import React, { useState, useEffect } from 'react';
import { StepIndicator } from '../components/wizard/StepIndicator';
import { Step1Upload } from '../components/wizard/Step1Upload';
import { Step2Verify } from '../components/wizard/Step2Verify';
import { Step3Generate } from '../components/wizard/Step3Generate';
import { Step4Audit } from '../components/wizard/Step4Audit';
import { Step5Review } from '../components/wizard/Step5Review';
import { Step6Approve } from '../components/wizard/Step6Approve';

import {
  StructuredDischargeInfo,
  AuthoritativeDischargeData,
  GeneratedReport,
  HybridAuditResult,
  DischargeDocument,
  HospitalInfo,
} from '../types/discharge';

interface Props {
  clinicianName: string;
  hospitalInfo: HospitalInfo;
  initialDocument?: DischargeDocument | null;
  activePatientContext?: { name: string; id: string } | null;
  onClearPatientContext?: () => void;
  onDocumentCreated: (doc: DischargeDocument) => void;
}

export const CreateInstructionsPage: React.FC<Props> = ({
  clinicianName,
  hospitalInfo,
  initialDocument,
  activePatientContext,
  onClearPatientContext,
  onDocumentCreated,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [extractedData, setExtractedData] = useState<StructuredDischargeInfo | null>(null);
  const [verifiedData, setVerifiedData] = useState<AuthoritativeDischargeData | null>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [auditResult, setAuditResult] = useState<HybridAuditResult | null>(null);
  const [document, setDocument] = useState<DischargeDocument | null>(null);

  // Load initial document if passed (e.g. from Review Queue or Documents list)
  useEffect(() => {
    if (initialDocument) {
      setDocument(initialDocument);
      setVerifiedData(initialDocument.verifiedData || null);
      setGeneratedReport(initialDocument.generatedReport || null);
      setAuditResult(initialDocument.auditResult || null);
      if (initialDocument.extractedInfo) setExtractedData(initialDocument.extractedInfo);

      if (initialDocument.approvalStatus === 'APPROVED') {
        setCurrentStep(6);
        setMaxReachedStep(6);
      } else if (initialDocument.generatedReport) {
        setCurrentStep(5);
        setMaxReachedStep(5);
      } else if (initialDocument.verifiedData) {
        setCurrentStep(3);
        setMaxReachedStep(3);
      }
    }
  }, [initialDocument]);

  const resetAllState = () => {
    setExtractedData(null);
    setVerifiedData(null);
    setGeneratedReport(null);
    setAuditResult(null);
    setDocument(null);
    setCurrentStep(1);
    setMaxReachedStep(1);
    if (onClearPatientContext) {
      onClearPatientContext();
    }
  };

  // Step 1 Handler: Extraction Started / Complete
  const handleStartNewExtraction = () => {
    setExtractedData(null);
    setVerifiedData(null);
    setGeneratedReport(null);
    setAuditResult(null);
    setDocument(null);
    if (onClearPatientContext) {
      onClearPatientContext();
    }
  };

  const handleExtractionComplete = (
    extracted: StructuredDischargeInfo,
    fileInfo: { name: string; type: 'pdf' | 'jpg' | 'png' | 'text' }
  ) => {
    // Clear all previous state cleanly
    setVerifiedData(null);
    setGeneratedReport(null);
    setAuditResult(null);
    setDocument(null);

    setExtractedData(extracted);
    setCurrentStep(2);
    setMaxReachedStep((prev) => Math.max(prev, 2));
  };


  // Step 2 Handler: Clinical Verification Complete
  const handleVerifyComplete = (verified: AuthoritativeDischargeData) => {
    setVerifiedData(verified);
    setCurrentStep(3);
    setMaxReachedStep((prev) => Math.max(prev, 3));
  };

  // Step 3 Handler: Generation Complete -> Run Audit Automatically!
  const handleGenerationComplete = async (report: GeneratedReport) => {
    if (!verifiedData) return;

    setGeneratedReport(report);
    setIsLoading(true);

    try {
      // Execute 18-Category Hybrid Audit
      const resAudit = await fetch('/api/audit-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifiedData,
          report,
        }),
      });

      if (!resAudit.ok) {
        throw new Error('Audit endpoint failed');
      }

      const audit: HybridAuditResult = await resAudit.json();
      setAuditResult(audit);

      // Persist Document
      const newDoc: DischargeDocument = {
        id: document?.id || `doc-${Date.now()}`,
        patientId: verifiedData.patient.patientId.value,
        extractedInfo: extractedData || undefined,
        verifiedData,
        generatedReport: report,
        auditResult: audit,
        approvalStatus: audit.overallStatus === 'CRITICAL_ISSUE' ? 'NEEDS_REVIEW' : 'AUDITED',
        createdAt: document?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hospitalInfo,
      };

      const resDoc = await fetch('/api/discharge-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDoc),
      });

      const savedDoc = resDoc.ok ? await resDoc.json() : newDoc;
      setDocument(savedDoc);
      onDocumentCreated(savedDoc);

      setCurrentStep(4);
      setMaxReachedStep((prev) => Math.max(prev, 4));
    } catch (err) {
      console.error('Audit execution error:', err);
      alert('Failed to execute hybrid safety audit.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 5 Handler: Update Report & Save
  const handleUpdateReport = async (
    updatedReport: GeneratedReport,
    reAuditResult?: HybridAuditResult
  ) => {
    setGeneratedReport(updatedReport);
    if (reAuditResult) setAuditResult(reAuditResult);

    if (document && verifiedData) {
      const updatedDoc: DischargeDocument = {
        ...document,
        generatedReport: updatedReport,
        auditResult: reAuditResult || document.auditResult,
        approvalStatus: reAuditResult?.overallStatus === 'CRITICAL_ISSUE' ? 'NEEDS_REVIEW' : 'AUDITED',
        updatedAt: new Date().toISOString(),
      };

      setDocument(updatedDoc);
      onDocumentCreated(updatedDoc);

      await fetch(`/api/discharge-documents/${updatedDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDoc),
      });
    }
  };

  const effectiveDocument: DischargeDocument | null = document
    ? {
        ...document,
        verifiedData: verifiedData || document.verifiedData,
        generatedReport: generatedReport || document.generatedReport,
        auditResult: auditResult || document.auditResult,
        hospitalInfo: document.hospitalInfo || hospitalInfo,
      }
    : verifiedData && generatedReport && auditResult
    ? {
        id: `doc-${Date.now()}`,
        patientId: verifiedData.patient.patientId.value,
        extractedInfo: extractedData || undefined,
        verifiedData,
        generatedReport,
        auditResult,
        approvalStatus: auditResult.overallStatus === 'CRITICAL_ISSUE' ? 'NEEDS_REVIEW' : 'AUDITED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hospitalInfo,
      }
    : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <div>
        <StepIndicator
          currentStep={currentStep}
          setStep={(s) => setCurrentStep(s)}
          maxReachedStep={maxReachedStep}
        />

        <main className="py-6">
          {currentStep === 1 && (
            <Step1Upload
              onExtractionComplete={handleExtractionComplete}
              onStartNewExtraction={handleStartNewExtraction}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          )}

          {currentStep === 2 && extractedData && (
            <Step2Verify
              extractedData={extractedData}
              onVerifyComplete={handleVerifyComplete}
              clinicianName={clinicianName}
            />
          )}

          {currentStep === 3 && verifiedData && (
            <Step3Generate
              verifiedData={verifiedData}
              onGenerationComplete={handleGenerationComplete}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          )}

          {currentStep === 4 && auditResult && (
            <Step4Audit
              auditResult={auditResult}
              verifiedData={verifiedData || undefined}
              report={generatedReport || undefined}
              onUpdateReport={handleUpdateReport}
              onProceedToReview={() => {
                setCurrentStep(5);
                setMaxReachedStep((prev) => Math.max(prev, 5));
              }}
              onProceedToApproval={() => {
                setCurrentStep(6);
                setMaxReachedStep((prev) => Math.max(prev, 6));
              }}
            />
          )}

          {currentStep === 5 && verifiedData && generatedReport && auditResult && (
            <Step5Review
              verifiedData={verifiedData}
              report={generatedReport}
              auditResult={auditResult}
              onUpdateReport={handleUpdateReport}
              onProceedToApproval={() => {
                setCurrentStep(6);
                setMaxReachedStep((prev) => Math.max(prev, 6));
              }}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          )}

          {currentStep === 6 && effectiveDocument && (
            <Step6Approve
              document={effectiveDocument}
              onApprovalSuccess={(updated) => {
                setDocument(updated);
                onDocumentCreated(updated);
              }}
              clinicianName={clinicianName}
            />
          )}
        </main>
      </div>
    </div>
  );
};
