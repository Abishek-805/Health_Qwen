import React, { useEffect, useState } from 'react';
import {
  Edit3,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import {
  AuthoritativeDischargeData,
  GeneratedReport,
  ReportSections,
  HybridAuditResult,
} from '../../types/discharge';
import { StatusBadge } from '../common/StatusBadge';

interface Props {
  verifiedData: AuthoritativeDischargeData;
  report: GeneratedReport;
  auditResult: HybridAuditResult;
  onUpdateReport: (updatedReport: GeneratedReport, reAuditResult?: HybridAuditResult) => Promise<void>;
  onProceedToApproval: () => void;
  onDirtyChange: (dirty: boolean) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
}

export const Step5Review: React.FC<Props> = ({
  verifiedData,
  report,
  auditResult,
  onUpdateReport,
  onProceedToApproval,
  onDirtyChange,
  isLoading,
  setIsLoading,
}) => {
  const [sections, setSections] = useState<ReportSections>(report.sections);
  const [activeRegenSection, setActiveRegenSection] = useState<keyof ReportSections | null>(null);
  const [regenPrompt, setRegenPrompt] = useState<string>('');
  const [isReAuditing, setIsReAuditing] = useState<boolean>(false);

  const hasUnsavedEdits = JSON.stringify(sections) !== JSON.stringify(report.sections);
  useEffect(() => { onDirtyChange(hasUnsavedEdits); return () => onDirtyChange(false); }, [hasUnsavedEdits, onDirtyChange]);

  const handleSectionTextChange = (key: keyof ReportSections, value: string) => {
    setSections((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyEditsAndReAudit = async () => {
    setIsLoading(true);
    setIsReAuditing(true);

    try {
      await onUpdateReport({ ...report, sections });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save and re-audit the report.');
    } finally {
      setIsLoading(false);
      setIsReAuditing(false);
    }
  };

  const handleRegenerateSection = async () => {
    if (!activeRegenSection || !regenPrompt.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/regenerate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifiedData,
          report,
          sectionKey: activeRegenSection,
          instruction: regenPrompt,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error || 'Section regeneration failed.');
      }

      const data = await res.json();
      setSections((prev) => ({ ...prev, [activeRegenSection]: data.updatedSectionText }));
      setActiveRegenSection(null);
      setRegenPrompt('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate section.');
    } finally {
      setIsLoading(false);
    }
  };

  const sectionLabels: Record<keyof ReportSections, string> = {
    summary: 'Summary & Patient Overview',
    diagnosisAndProcedures: 'Diagnoses & Procedures',
    medicationInstructions: 'Medication Schedule & Directions',
    dietAndActivity: 'Dietary & Activity Restrictions',
    woundCareAndHygiene: 'Incision & Wound Care',
    followUpAppointments: 'Follow-Up Appointments',
    warningSignsAndEmergency: 'Warning Signs & Emergency Instructions',
    additionalInstructions: 'Additional Special Notes',
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Top Banner */}
      <div className="mb-6 rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5A5A40] text-white shadow-xs">
            <Edit3 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif italic text-xl text-[#3E4234] flex items-center gap-2">
              <span>Step 5 — Clinical Review & Section Revision</span>
              <span className="rounded-full bg-[#D9D1C5] text-[#5A5A40] px-2.5 py-0.5 text-[10px] font-bold">
                Report v{report.version}
              </span>
            </h3>
            <p className="text-xs text-[#665F54] mt-0.5">
              Refine instructions directly or prompt AI to adjust specific sections. Any modifications trigger a version increment and automated re-audit.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase text-[#665F54]">Current Audit Status</div>
            <StatusBadge status={auditResult.overallStatus} size="sm" />
          </div>
          <button
            type="button"
            onClick={handleApplyEditsAndReAudit}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-2xl bg-[#5A5A40] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#4A4A34] cursor-pointer disabled:opacity-50 transition-all uppercase tracking-wider"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isReAuditing ? 'animate-spin' : ''}`} />
            <span>SAVE EDITS & RE-AUDIT</span>
          </button>
        </div>
      </div>

      {/* Main Split View: Verified Data vs Handout Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Verified Data Source Reference */}
        <div className="lg:col-span-4 rounded-[28px] bg-[#3E4234] text-white p-6 shadow-xs border border-[#2A2D23] h-fit">
          <div className="flex items-center justify-between border-b border-[#5A5A40]/40 pb-3 mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#D9D1C5] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#5A5A40]" /> Verified Source Reference
            </h4>
            <span className="text-[10px] bg-[#5A5A40] text-white px-2 py-0.5 rounded font-mono font-bold">
              LOCKED DATA
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <span className="text-[#665F54] block text-[10px] uppercase font-bold">Patient</span>
              <p className="font-bold text-white text-sm">
                {verifiedData.patient.name.value} ({verifiedData.patient.patientId.value})
              </p>
            </div>

            <div>
              <span className="text-[#665F54] block text-[10px] uppercase font-bold">Diagnoses</span>
              <p className="text-[#D9D1C5]">
                {verifiedData.diagnosis.map((d) => d.value).join(', ') || 'None specified'}
              </p>
            </div>

            <div>
              <span className="text-[#665F54] block text-[10px] uppercase font-bold">Verified Medications</span>
              <ul className="mt-1 space-y-1">
                {verifiedData.medications.map((m, i) => (
                  <li key={i} className="rounded-xl bg-[#2A2D23] p-2.5 border border-[#5A5A40]/30">
                    <span className="font-bold text-white">{m.name}</span> — {m.dosage || 'Dose N/A'},{' '}
                    {m.frequency || 'Freq N/A'}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <span className="text-[#8C4A4A] block text-[10px] uppercase font-bold">Allergies</span>
              <p className="text-[#8C4A4A] font-bold">
                {verifiedData.allergies.map((a) => a.value).join(', ') || 'Allergy information not provided'}
              </p>
            </div>

            <div>
              <span className="text-[#665F54] block text-[10px] uppercase font-bold">Follow-Up</span>
              <p className="text-[#D9D1C5]">
                {verifiedData.followUp.map((fu) => `${fu.provider} on ${fu.date} @ ${fu.time}`).join(' | ') ||
                  'None specified'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Editable Handout Sections */}
        <div className="lg:col-span-8 space-y-5">
          {(Object.keys(sections) as (keyof ReportSections)[]).map((secKey) => {
            const secTitle = sectionLabels[secKey];
            const secContent = sections[secKey];

            return (
              <div key={secKey} className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#3E4234] flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#5A5A40]" /> {secTitle}
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveRegenSection(secKey);
                      setRegenPrompt('');
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-[#F5F5F0] px-3 py-1.5 text-xs font-bold text-[#5A5A40] hover:bg-[#D9D1C5] cursor-pointer border border-[#D9D1C5] transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[#5A5A40]" /> AI Rewrite
                  </button>
                </div>

                <textarea aria-label={secTitle}
                  rows={3}
                  value={secContent}
                  onChange={(e) => handleSectionTextChange(secKey, e.target.value)}
                  className="w-full rounded-2xl border border-[#D9D1C5] p-3.5 text-xs text-[#3E4234] font-medium focus:border-[#5A5A40] focus:bg-white focus:outline-none bg-[#F5F5F0]/50 transition-all"
                />
              </div>
            );
          })}

          <div className="pt-4 flex justify-between items-center">
            <div className="text-xs text-[#665F54] flex items-center gap-2 font-medium">
              <ShieldAlert className="h-4 w-4 text-[#D2B48C]" />
              <span>Save all edits and review the current audit before sign-off.</span>
            </div>

            <button
              type="button"
              disabled={isLoading || hasUnsavedEdits}
              onClick={onProceedToApproval}
              className="flex items-center gap-2 rounded-2xl bg-[#5A5A40] px-6 py-3 text-xs font-bold text-white shadow-xs hover:bg-[#4A4A34] active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
            >
              <span>PROCEED TO FINAL APPROVAL & PDF</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Section Regeneration Modal */}
      {activeRegenSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3E4234]/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-[28px] bg-white p-8 shadow-xl border border-[#D9D1C5]">
            <div className="flex items-center justify-between border-b border-[#F5F5F0] pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#5A5A40]" />
                <h3 className="font-serif italic text-lg text-[#3E4234]">
                  Regenerate Section: {sectionLabels[activeRegenSection]}
                </h3>
              </div>
              <button
                onClick={() => setActiveRegenSection(null)}
                className="rounded-full p-1 text-[#665F54] hover:bg-[#F5F5F0] hover:text-[#3E4234] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#665F54] mb-3">
              Describe how you want AI to rewrite this section (e.g., &quot;Simplify terms for a senior citizen&quot;, &quot;Add caution for low sodium&quot;).
            </p>

            <textarea aria-label="Type revision prompt..."
              rows={4}
              value={regenPrompt}
              onChange={(e) => setRegenPrompt(e.target.value)}
              placeholder="Type revision prompt..."
              className="w-full rounded-2xl border border-[#D9D1C5] p-3.5 text-xs text-[#3E4234] font-medium focus:border-[#5A5A40] focus:outline-none mb-4 bg-[#F5F5F0]/50 transition-all"
            />

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveRegenSection(null)}
                className="rounded-2xl border border-[#D9D1C5] px-5 py-2.5 text-xs font-bold text-[#3E4234] hover:bg-[#F5F5F0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRegenerateSection}
                disabled={isLoading || !regenPrompt.trim()}
                className="flex items-center gap-2 rounded-2xl bg-[#5A5A40] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#4A4A34] disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>Regenerate Section</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
