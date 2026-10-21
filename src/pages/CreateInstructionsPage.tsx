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
  onDirtyChange: (dirty: boolean) => void;
}

export function sourceNavigationBlocked(currentStep: number, nextStep: number, dirty: boolean): boolean {
  return dirty && currentStep !== nextStep && (currentStep === 2 || nextStep > 2);
}

export const CreateInstructionsPage: React.FC<Props> = ({
  clinicianName,
  hospitalInfo,
  initialDocument,
  activePatientContext,
  onClearPatientContext,
  onDocumentCreated,
  onDirtyChange,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<number>(1);
  const [hasUnsavedReportEdits, setHasUnsavedReportEdits] = useState(false);
  const [hasUnsavedSourceEdits, setHasUnsavedSourceEdits] = useState(false);
  useEffect(() => { onDirtyChange(hasUnsavedReportEdits || hasUnsavedSourceEdits); return () => onDirtyChange(false); }, [hasUnsavedReportEdits, hasUnsavedSourceEdits, onDirtyChange]);
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
      setExtractedData(initialDocument.extractedInfo || initialDocument.verifiedData || null);

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
    setHasUnsavedSourceEdits(true);
    setCurrentStep(2);
    setMaxReachedStep((prev) => Math.max(prev, 2));
  };


  // Step 2 Handler: Clinical Verification Complete
  const handleVerifyComplete = (verified: AuthoritativeDischargeData) => {
    setGeneratedReport(null); setAuditResult(null);
    setMaxReachedStep(3);
    setVerifiedData(verified);
    setExtractedData(verified);
    setHasUnsavedSourceEdits(true);
    setCurrentStep(3);
    setMaxReachedStep((prev) => Math.max(prev, 3));
  };

  // Save first; the server assigns the version and recomputes the audit.
  const handleGenerationComplete = async (report: GeneratedReport) => {
    if (!verifiedData) return;
    setIsLoading(true);
    try {
      const res = await fetch(document ? '/api/discharge-documents/' + document.id : '/api/discharge-documents', {
        method: document ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...(document ? { 'If-Match': String(document.currentVersion) } : {}) },
        body: JSON.stringify({ verifiedData, generatedReport: report, hospitalInfo }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Document save failed');
      const saved: DischargeDocument = await res.json();
      setDocument(saved); setGeneratedReport(saved.generatedReport!); setAuditResult(saved.auditResult!);
      setHasUnsavedSourceEdits(false);
      onDocumentCreated(saved); setCurrentStep(4); setMaxReachedStep(prev => Math.max(prev, 4));
    } finally { setIsLoading(false); }
  };

  const handleUpdateReport = async (updatedReport: GeneratedReport, _audit?: HybridAuditResult, repairedData?: AuthoritativeDischargeData) => {
    if (!document || !verifiedData) throw new Error('Save the document before editing.');
    const res = await fetch('/api/discharge-documents/' + document.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': String(document.currentVersion) },
      body: JSON.stringify({ verifiedData: repairedData || verifiedData, generatedReport: updatedReport, hospitalInfo }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Document save failed');
    const saved: DischargeDocument = await res.json();
    setVerifiedData(saved.verifiedData!);
    setExtractedData(saved.verifiedData!);
    setDocument(saved); setGeneratedReport(saved.generatedReport!); setAuditResult(saved.auditResult!);
    onDocumentCreated(saved);
    return saved.auditResult;
  };

  const effectiveDocument = !hasUnsavedSourceEdits && generatedReport && auditResult ? document : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <div>
        <StepIndicator
          currentStep={currentStep}
          setStep={(s) => {
            if (hasUnsavedReportEdits && s !== currentStep) { alert('Save report edits before changing steps.'); return; }
            if (sourceNavigationBlocked(currentStep, s, hasUnsavedSourceEdits)) { alert('Confirm the changed source, then generate and save its report before reviewing or approving.'); return; }
            setCurrentStep(s);
          }}
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
              onDirtyChange={setHasUnsavedSourceEdits}
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
              documentId={document?.id}
              onProceedToSource={() => setCurrentStep(2)}
              auditResult={auditResult}
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
              onDirtyChange={setHasUnsavedReportEdits}
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
