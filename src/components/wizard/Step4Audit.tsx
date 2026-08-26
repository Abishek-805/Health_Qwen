import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSearch,
  ArrowRight,
  Info,
  Sparkles,
  RefreshCw,
  Lock,
} from 'lucide-react';
import {
  HybridAuditResult,
  AuditFinding,
  AuditCategory,
  AuthoritativeDischargeData,
  GeneratedReport,
  ReportSections,
} from '../../types/discharge';
import { StatusBadge } from '../common/StatusBadge';

interface Props {
  auditResult: HybridAuditResult;
  verifiedData?: AuthoritativeDischargeData;
  report?: GeneratedReport;
  onUpdateReport?: (updatedReport: GeneratedReport, reAuditResult?: HybridAuditResult) => void;
  onProceedToReview: () => void;
  onProceedToApproval?: () => void;
}

const CATEGORY_NAMES: Record<AuditCategory, string> = {
  PATIENT_INFORMATION: '1. Patient Identification',
  DIAGNOSIS: '2. Diagnoses',
  PROCEDURES: '3. Procedures Performed',
  MEDICATIONS: '4. Medication Names & Dosages',
  ALLERGIES: '5. Drug & Food Allergies',
  FOLLOW_UP: '6. Follow-up Appointments',
  OMISSIONS: '7. Omitted Information',
  NUMERIC_VALUES: '8. Numeric Accuracy',
  DATES: '9. Date & Time Accuracy',
  DIET: '10. Dietary Instructions',
  ACTIVITY_RESTRICTIONS: '11. Activity Restrictions',
  WOUND_PROCEDURE_CARE: '12. Wound & Incision Care',
  WARNING_SIGNS: '13. Warning Signs & Symptoms',
  EMERGENCY_INSTRUCTIONS: '14. Emergency Protocol',
  UNSUPPORTED_CLAIMS: '15. Unsupported Claims',
  CONTRADICTIONS: '16. Contradictory Statements',
  MEDICAL_MEANING: '17. Medical Meaning & Safety',
  WORDING: '18. Language & Reading Grade Level',
};

const CATEGORY_TO_SECTION: Record<AuditCategory, keyof ReportSections> = {
  PATIENT_INFORMATION: 'summary',
  DIAGNOSIS: 'diagnosisAndProcedures',
  PROCEDURES: 'diagnosisAndProcedures',
  MEDICATIONS: 'medicationInstructions',
  ALLERGIES: 'medicationInstructions',
  FOLLOW_UP: 'followUpAppointments',
  OMISSIONS: 'summary',
  NUMERIC_VALUES: 'medicationInstructions',
  DATES: 'followUpAppointments',
  DIET: 'dietAndActivity',
  ACTIVITY_RESTRICTIONS: 'dietAndActivity',
  WOUND_PROCEDURE_CARE: 'woundCareAndHygiene',
  WARNING_SIGNS: 'warningSignsAndEmergency',
  EMERGENCY_INSTRUCTIONS: 'warningSignsAndEmergency',
  UNSUPPORTED_CLAIMS: 'summary',
  CONTRADICTIONS: 'summary',
  MEDICAL_MEANING: 'summary',
  WORDING: 'summary',
};

function getFactToAppend(finding: AuditFinding, verifiedData?: AuthoritativeDischargeData): string {
  if (finding.verifiedSourceText && finding.verifiedSourceText !== 'N/A') {
    return finding.verifiedSourceText;
  }

  if (!verifiedData) return finding.title;

  switch (finding.category) {
    case 'PATIENT_INFORMATION':
      return `Patient ID: ${verifiedData.patient.patientId.value}`;
    case 'ALLERGIES':
      if (verifiedData.allergies && verifiedData.allergies.length > 0) {
        const list = verifiedData.allergies
          .map((a) => (typeof a === 'string' ? a : a.value))
          .join(', ');
        return `⚠️ DRUG ALLERGIES: ${list}`;
      }
      return 'No Known Drug Allergies (NKDA)';
    case 'MEDICATIONS':
    case 'NUMERIC_VALUES':
      if (verifiedData.medications && verifiedData.medications.length > 0) {
        return `Medication Schedule: ${verifiedData.medications
          .map((m) => `${m.name} ${m.dosage || ''} ${m.frequency || ''}`)
          .join('; ')}`;
      }
      break;
    case 'FOLLOW_UP':
    case 'DATES':
      if (verifiedData.followUp && verifiedData.followUp.length > 0) {
        return `Follow-Up: ${verifiedData.followUp
          .map((f) => `${f.provider} on ${f.date} @ ${f.time}`)
          .join('; ')}`;
      }
      break;
    case 'DIAGNOSIS':
    case 'PROCEDURES':
      if (verifiedData.diagnosis && verifiedData.diagnosis.length > 0) {
        return `Diagnosis: ${verifiedData.diagnosis.map((d) => d.value).join(', ')}`;
      }
      break;
  }

  return finding.title;
}

export const Step4Audit: React.FC<Props> = ({
  auditResult,
  verifiedData,
  report,
  onUpdateReport,
  onProceedToReview,
  onProceedToApproval,
}) => {
  const [selectedFinding, setSelectedFinding] = useState<AuditFinding | null>(null);
  const [isApplyingFix, setIsApplyingFix] = useState<boolean>(false);
  const [fixError, setFixError] = useState<string | null>(null);

  const findings = auditResult?.findings || [];
  const isCritical = auditResult?.overallStatus === 'CRITICAL_ISSUE';
  const isReviewReq = auditResult?.overallStatus === 'REVIEW_REQUIRED';
  const isPass = auditResult?.overallStatus === 'PASS';

  const criticalCount = auditResult?.criticalCount ?? findings.filter((f) => f.status === 'CRITICAL_ISSUE').length;
  const warningCount = auditResult?.warningCount ?? findings.filter((f) => f.status === 'REVIEW_REQUIRED').length;
  const passCount = auditResult?.passCount ?? Math.max(0, 18 - criticalCount - warningCount);

  const handleApplyFixAndReAudit = async () => {
    if (!report || !onUpdateReport || !selectedFinding) return;

    setIsApplyingFix(true);
    setFixError(null);

    const targetSecKey = CATEGORY_TO_SECTION[selectedFinding.category];
    const existingText = report.sections[targetSecKey] || '';
    const factToAppend = getFactToAppend(selectedFinding, verifiedData);

    const updatedSecText = existingText
      ? `${existingText}\n\n- ${factToAppend}`
      : factToAppend;

    const newVersion = (report.version || 1) + 1;
    const updatedReport: GeneratedReport = {
      ...report,
      version: newVersion,
      sections: {
        ...report.sections,
        [targetSecKey]: updatedSecText,
      },
      generatedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/audit-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifiedData: verifiedData || {},
          report: updatedReport,
        }),
      });

      if (!res.ok) {
        throw new Error('Re-audit request failed. Please check backend service status.');
      }

      const reAuditResult = (await res.json()) as HybridAuditResult;
      // Update report & audit result in parent state, close modal, STAY ON STEP 4
      onUpdateReport(updatedReport, reAuditResult);
      setSelectedFinding(null);
    } catch (err: any) {
      console.error('Apply fix error:', err);
      setFixError(err.message || 'Failed to apply automatic fix & re-audit.');
    } finally {
      setIsApplyingFix(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Verdict Header */}
      <div
        className={`mb-6 rounded-2xl p-6 border shadow-sm transition-all ${
          isCritical
            ? 'bg-rose-50 border-rose-300 text-rose-950'
            : isReviewReq
            ? 'bg-amber-50 border-amber-300 text-amber-950'
            : 'bg-emerald-50 border-emerald-300 text-emerald-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 pb-4 mb-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md ${
                isCritical ? 'bg-rose-600' : isReviewReq ? 'bg-amber-600' : 'bg-emerald-600'
              }`}
            >
              {isCritical ? (
                <XCircle className="h-7 w-7" />
              ) : isReviewReq ? (
                <AlertTriangle className="h-7 w-7" />
              ) : (
                <ShieldCheck className="h-7 w-7" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500">
                  HYBRID SAFETY AUDIT VERDICT
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded-full font-bold">
                  v{auditResult?.reportVersion || report?.version || 1}
                </span>
              </div>
              <h3 className="text-lg font-black tracking-tight mt-0.5">
                {isCritical
                  ? 'CRITICAL SAFETY ISSUE DETECTED — APPROVAL BLOCKED'
                  : isReviewReq
                  ? 'AUDIT PASSED WITH REVIEW WARNINGS'
                  : 'SAFE — 18-CATEGORY CLINICAL AUDIT PASSED'}
              </h3>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={auditResult?.overallStatus || 'PASS'} size="lg" />
            <div className="text-[11px] font-bold text-slate-600 mt-1">
              REC: <StatusBadge status={auditResult?.approvalRecommendation || auditResult?.recommendation || 'READY_FOR_HUMAN_APPROVAL'} size="sm" />
            </div>
          </div>
        </div>

        <p className="text-xs leading-relaxed font-medium">
          {auditResult?.summary || 'Audit evaluation complete.'}
        </p>

        {/* Counts summary pill */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold">
          <div className="rounded-lg bg-white/80 px-3 py-1.5 border border-slate-200">
            Total Checked Categories: <span className="font-bold">18 / 18</span>
          </div>
          <div className="rounded-lg bg-rose-100/80 text-rose-900 px-3 py-1.5 border border-rose-200">
            Critical Findings: <span className="font-extrabold">{criticalCount}</span>
          </div>
          <div className="rounded-lg bg-amber-100/80 text-amber-900 px-3 py-1.5 border border-amber-200">
            Warnings: <span className="font-extrabold">{warningCount}</span>
          </div>
          <div className="rounded-lg bg-emerald-100/80 text-emerald-900 px-3 py-1.5 border border-emerald-200">
            Pass Count: <span className="font-extrabold">{passCount}</span>
          </div>
          <div className="rounded-lg bg-slate-100 px-3 py-1.5 border border-slate-200 text-slate-700 text-[11px] flex items-center gap-1">
            <Lock className="h-3 w-3 text-slate-500" />
            <span>Verified Source Data: <strong>UNCHANGED</strong></span>
          </div>
        </div>
      </div>

      {/* 18-Category Safety Grid */}
      <div className="rounded-[28px] bg-white p-8 shadow-xs border border-[#D9D1C5]/60 mb-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#3E4234] mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#5A5A40]" /> 18-CATEGORY AUDIT MATRIX BREAKDOWN
          </span>
          <span className="text-[11px] text-[#8C8476] font-normal">Click any category finding to inspect evidence & apply quick fix</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(CATEGORY_NAMES) as AuditCategory[]).map((catKey) => {
            const catName = CATEGORY_NAMES[catKey];
            const catFindings = findings.filter((f) => f.category === catKey);
            const catStatus =
              auditResult?.categoryStatus?.[catKey] ||
              auditResult?.categorySummaries?.[catKey]?.status ||
              (catFindings.some((f) => f.status === 'CRITICAL_ISSUE')
                ? 'CRITICAL_ISSUE'
                : catFindings.some((f) => f.status === 'REVIEW_REQUIRED')
                ? 'REVIEW_REQUIRED'
                : 'PASS');

            return (
              <div
                key={catKey}
                onClick={() => catFindings.length > 0 && setSelectedFinding(catFindings[0])}
                className={`rounded-2xl border p-4 transition-all ${
                  catFindings.length > 0 ? 'cursor-pointer hover:shadow-xs hover:border-[#5A5A40]' : ''
                } ${
                  catStatus === 'CRITICAL_ISSUE'
                    ? 'border-[#BC8F8F] bg-[#BC8F8F]/10'
                    : catStatus === 'REVIEW_REQUIRED'
                    ? 'border-[#D2B48C] bg-[#D2B48C]/15'
                    : 'border-[#D9D1C5] bg-[#F5F5F0]/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-[#3E4234] truncate" title={catName}>
                    {catName}
                  </span>
                  <StatusBadge status={catStatus} size="sm" />
                </div>

                {catFindings.length > 0 ? (
                  <div className="text-[11px] text-[#3E4234] mt-1 line-clamp-2 font-medium">
                    🔍 {catFindings[0].title}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#5A5A40] flex items-center gap-1 mt-1 font-semibold">
                    <CheckCircle2 className="h-3 w-3 text-[#5A5A40]" /> Verified safe
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Streamlined Single-Action Finding Modal */}
      {selectedFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3E4234]/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-8 shadow-xl border border-[#D9D1C5] max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#F5F5F0] pb-4 mb-4">
              <div className="flex items-center gap-2">
                <FileSearch className="h-5 w-5 text-[#5A5A40]" />
                <h3 className="font-serif italic text-lg text-[#3E4234]">{selectedFinding.title}</h3>
              </div>
              <button
                onClick={() => !isApplyingFix && setSelectedFinding(null)}
                disabled={isApplyingFix}
                className="rounded-full p-1 text-[#8C8476] hover:bg-[#F5F5F0] hover:text-[#3E4234] cursor-pointer disabled:opacity-30"
              >
                ✕
              </button>
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 mb-4">
              <StatusBadge status={selectedFinding.status} />
              <span className="text-xs font-bold text-[#8C8476]">Category: {selectedFinding.categoryName}</span>
              <span className="text-xs text-[#8C8476]">•</span>
              <span className="text-[11px] font-semibold text-[#5A5A40] flex items-center gap-1">
                {selectedFinding.isDeterministic ? '⚡ Deterministic Rule' : <><Sparkles className="h-3 w-3" /> Semantic AI Check</>}
              </span>
            </div>

            {/* Side-by-Side Data Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="rounded-2xl border border-[#D9D1C5] bg-[#F5F5F0] p-3.5">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#8C8476] mb-1">
                  Verified Source Data
                </div>
                <div className="text-xs font-bold text-[#3E4234] whitespace-pre-wrap font-mono bg-white p-3 rounded-xl border border-[#D9D1C5]">
                  {selectedFinding.verifiedSourceText || 'N/A'}
                </div>
              </div>

              <div className="rounded-2xl border border-[#BC8F8F] bg-[#BC8F8F]/10 p-3.5">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#8C4A4A] mb-1">
                  Generated Handout Text
                </div>
                <div className="text-xs font-bold text-[#8C4A4A] whitespace-pre-wrap font-mono bg-white p-3 rounded-xl border border-[#BC8F8F]">
                  {selectedFinding.generatedReportText || 'N/A'}
                </div>
              </div>
            </div>

            {/* Why This Matters */}
            <div className="rounded-2xl bg-[#D2B48C]/15 p-4 border border-[#D2B48C]/40 text-[#3E4234] text-xs mb-6">
              <div className="font-bold flex items-center gap-1.5 text-[#7A5A30] mb-1">
                <Info className="h-4 w-4 text-[#7A5A30]" /> WHY THIS MATTERS FOR CLINICAL SAFETY
              </div>
              <p>{selectedFinding.whyItMatters}</p>
            </div>

            {/* Fix Execution Error Banner */}
            {fixError && (
              <div className="mb-4 rounded-xl bg-rose-50 border border-rose-300 p-3 text-xs font-bold text-rose-800 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{fixError}</span>
              </div>
            )}

            {/* Single Prominent Action Button: APPLY FIX & RE-AUDIT */}
            <div className="space-y-3 border-t border-[#F5F5F0] pt-6">
              <button
                type="button"
                disabled={isApplyingFix || !report || !onUpdateReport}
                onClick={handleApplyFixAndReAudit}
                className="w-full flex items-center justify-center gap-3 rounded-2xl bg-[#5A5A40] px-8 py-4 text-sm font-bold text-white shadow-md hover:bg-[#4A4A34] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
              >
                {isApplyingFix ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>APPLYING FIX & RE-AUDITING...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-5 w-5" />
                    <span>APPLY FIX & RE-AUDIT</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-2 text-xs">
                <button
                  type="button"
                  disabled={isApplyingFix}
                  onClick={() => setSelectedFinding(null)}
                  className="text-[#8C8476] font-semibold hover:text-[#3E4234] cursor-pointer hover:underline"
                >
                  Close Finding
                </button>
                <button
                  type="button"
                  disabled={isApplyingFix}
                  onClick={() => {
                    setSelectedFinding(null);
                    onProceedToReview();
                  }}
                  className="text-[#5A5A40] font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>Open Full Review (Step 5)</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Navigation — Explicit Clinician Decisions */}
      <div className="flex flex-col sm:flex-row items-center justify-between rounded-2xl bg-[#F5F5F0] p-5 border border-[#D9D1C5] gap-4">
        <div className="text-xs text-[#5A5A40] font-medium flex items-center gap-2">
          <Info className="h-4 w-4 text-[#5A5A40] shrink-0" />
          <span>
            {isCritical
              ? 'Critical issue active. Apply quick fix above or click Clinical Review to manually edit handout text.'
              : isPass
              ? 'All 18 safety checks passed! Select your next step below.'
              : 'Review warnings detected. You may fix them or proceed to Clinical Review.'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onProceedToReview}
            className="flex items-center gap-2 rounded-2xl border border-[#D9D1C5] bg-white px-5 py-3 text-xs font-bold text-[#3E4234] hover:bg-[#F5F5F0] active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
          >
            <span>CLINICAL REVIEW (STEP 5)</span>
            <ArrowRight className="h-4 w-4" />
          </button>

          {isPass && onProceedToApproval && (
            <button
              type="button"
              onClick={onProceedToApproval}
              className="flex items-center gap-2 rounded-2xl bg-[#5A5A40] px-6 py-3 text-xs font-bold text-white shadow-xs hover:bg-[#4A4A34] active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
            >
              <span>CONTINUE TO APPROVAL (STEP 6)</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
