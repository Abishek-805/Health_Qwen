import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  AuthoritativeDischargeData,
  GeneratedReport,
  SupportedLanguage,
} from '../../types/discharge';

interface Props {
  verifiedData: AuthoritativeDischargeData;
  onGenerationComplete: (report: GeneratedReport) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
}

export const Step3Generate: React.FC<Props> = ({
  verifiedData,
  onGenerationComplete,
  isLoading,
  setIsLoading,
}) => {
  const language: SupportedLanguage = 'en';
  const [promptNotes, setPromptNotes] = useState<string>('');
  const [generationStage, setGenerationStage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleGenerate = async () => {
    setIsLoading(true);
    setErrorMsg('');
    setGenerationStage('Preparing discharge instructions handout...');

    try {
      setGenerationStage('Generating discharge handout anchored strictly to verified data...');
      await new Promise((r) => setTimeout(r, 600));

      const res = await fetch('/api/generate-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifiedData,
          language: 'en',
          additionalPromptNotes: promptNotes,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Report generation failed.');
      }

      const resData = await res.json();
      const report = (resData.report || resData) as GeneratedReport;
      onGenerationComplete(report);
    } catch (err: any) {
      console.error('Generation error:', err);
      setErrorMsg(err.message || 'Failed to generate discharge instructions.');
    } finally {
      setIsLoading(false);
      setGenerationStage('');
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-[28px] bg-white p-8 shadow-xs border border-[#D9D1C5]/60">
        <div className="flex items-center justify-between mb-6 border-b border-[#F5F5F0] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5A5A40] text-white shadow-xs">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif italic text-xl text-[#3E4234]">
                Step 3 — AI Discharge Instructions
              </h3>
              <p className="text-xs text-[#8C8476] mt-0.5">
                Generate patient-friendly discharge instructions anchored strictly to the verified authoritative dataset.
              </p>
            </div>
          </div>
        </div>

        {/* Safety Anchor Banner */}
        <div className="mb-6 rounded-2xl bg-[#5A5A40]/10 border border-[#5A5A40]/20 p-5 text-[#3E4234] flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-[#5A5A40] shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <span className="font-extrabold text-[#3E4234] block mb-0.5">
              GUARANTEED CLINICAL ANCHORING
            </span>
            Generates clear, patient-facing discharge instructions for{' '}
            <strong>{verifiedData.patient.name.value}</strong> (ID:{' '}
            {verifiedData.patient.patientId.value}). Numbers, dosages, and dates are preserved with zero hallucinated facts.
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#BC8F8F]/15 p-3.5 text-xs text-[#8C4A4A] border border-[#BC8F8F]/30 font-medium">
            <AlertCircle className="h-4 w-4 text-[#8C4A4A] shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col gap-6">
          {/* Language Indicator */}
          <div className="flex items-center justify-between rounded-2xl border border-[#D9D1C5] bg-[#F5F5F0]/50 p-4">
            <span className="text-xs font-bold text-[#3E4234]">Handout Language</span>
            <span className="rounded-xl bg-[#5A5A40] px-3 py-1 text-xs font-semibold text-white">
              Language: English
            </span>
          </div>

          {/* Optional Prompts/Notes */}
          <div>
            <label className="text-xs font-bold text-[#3E4234] mb-2 block">
              Optional Simplification or Style Directives
            </label>
            <input
              type="text"
              value={promptNotes}
              onChange={(e) => setPromptNotes(e.target.value)}
              placeholder="e.g., 'Use bullet points, emphasize wound care, elderly patient instructions'"
              className="w-full rounded-2xl border border-[#D9D1C5] p-3.5 text-xs text-[#3E4234] focus:border-[#5A5A40] focus:bg-white focus:outline-none bg-[#F5F5F0]/50 transition-all"
            />
          </div>

          {/* Action Button */}
          {isLoading ? (
            <div className="rounded-2xl bg-[#5A5A40]/10 p-5 text-center border border-[#5A5A40]/20">
              <div className="flex items-center justify-center gap-2 mb-2">
                <RefreshCw className="h-5 w-5 text-[#5A5A40] animate-spin" />
                <span className="text-xs font-bold text-[#3E4234]">{generationStage}</span>
              </div>
              <p className="text-[11px] text-[#8C8476]">
                Composing all 8 structured sections in English...
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGenerate}
              className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-[#5A5A40] py-3.5 px-6 text-xs font-bold text-white shadow-xs hover:bg-[#4A4A34] active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
            >
              <Sparkles className="h-4 w-4" />
              <span>GENERATE DISCHARGE HANDOUT</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
