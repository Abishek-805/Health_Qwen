import React, { useState } from 'react';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  FileCode,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { StructuredDischargeInfo } from '../../types/discharge';

interface Props {
  onExtractionComplete: (extracted: StructuredDischargeInfo, fileInfo: { name: string; type: 'pdf' | 'jpg' | 'png' | 'text' }) => void;
  onStartNewExtraction?: () => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
}

export const Step1Upload: React.FC<Props> = ({
  onExtractionComplete,
  onStartNewExtraction,
  isLoading,
  setIsLoading,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [extractionStage, setExtractionStage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setTextInput(''); // Clear any pasted text/sample data
      setErrorMsg('');

      if (selected.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(selected));
      } else {
        setPreviewUrl(null);
      }
    }
  };

  const processExtraction = async (fileToUpload?: File, textToUpload?: string) => {
    const payloadFile = fileToUpload || file;
    const payloadText = textToUpload !== undefined ? textToUpload : textInput;

    if (!payloadFile && !payloadText.trim()) {
      setErrorMsg('Please select a PDF/image file or paste clinical discharge text.');
      return;
    }

    if (onStartNewExtraction) {
      onStartNewExtraction();
    }

    setIsLoading(true);
    setErrorMsg('');
    setExtractionStage('Initializing local Qwen2.5 engine...');

    try {
      const formData = new FormData();
      if (payloadFile) {
        formData.append('file', payloadFile);
      }
      if (payloadText.trim()) {
        formData.append('textInput', payloadText);
      }

      setExtractionStage('Running local clinical extraction service...');
      const res = await fetch('/api/extract-discharge', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Clinical extraction failed. Please retry.');
      }

      const extractedData = (await res.json()) as StructuredDischargeInfo;

      const fileType = payloadFile
        ? payloadFile.type.includes('pdf')
          ? 'pdf'
          : payloadFile.type.includes('png')
          ? 'png'
          : 'jpg'
        : 'text';

      const fileName = payloadFile ? payloadFile.name : 'Pasted Clinical Summary.txt';

      onExtractionComplete(extractedData, { name: fileName, type: fileType });
    } catch (err: any) {
      console.error('Extraction error:', err);
      setErrorMsg(err.message || 'Clinical extraction failed. Please retry.');
    } finally {
      setIsLoading(false);
      setExtractionStage('');
    }
  };


  const loadSampleData = (sampleType: 'angioplasty' | 'diabetic_foot') => {
    setFile(null);
    setPreviewUrl(null);
    if (sampleType === 'angioplasty') {
      const text = `PATIENT DISCHARGE SUMMARY
Apollo Heart Center
Patient Name: Rajesh Kumar | Patient ID: PAT-88492 | Age: 54 | Gender: Male
Primary Diagnosis: Acute Coronary Syndrome - Post Angioplasty, Essential Hypertension
Procedures: Percutaneous Coronary Intervention (PCI) with Drug-Eluting Stent (DES) to LAD.

DISCHARGE MEDICATIONS:
1. Aspirin 150 mg - Once daily after breakfast for 30 days.
2. Clopidogrel 75 mg - Once daily in the morning for 90 days. Do not stop without cardiologist consultation.
3. Atorvastatin 40 mg - Once daily at bedtime. Avoid grapefruit.
4. Metoprolol Succinate 25 mg - Check pulse before taking. (Frequency omitted in notes).

ALLERGIES:
Penicillin - causes skin hives.

DIET & ACTIVITY:
Low sodium cardiac diet (< 2g/day). Fluid restriction 1.5 L/day.
No driving for 2 weeks. No lifting > 5 kg for 4 weeks. Light walking permitted.

WOUND CARE:
Keep groin puncture site dressing clean and dry for 48 hours.

FOLLOW-UP:
Dr. Sarah Jenkins at Cardiology Outpatient Clinic on 2026-08-25 at 10:30 AM (Building B, Room 304). Bring BP log.

WARNING SIGNS & EMERGENCY:
Chest tightness or puncture site swelling. Call 108 / 911 if chest pain lasts > 5 minutes.`;

      setTextInput(text);
      setActiveTab('text');
      processExtraction(undefined, text);
    } else {
      const text = `DISCHARGE SUMMARY - ENDOCRINOLOGY / SURGERY
City Specialty Hospital
Patient Name: Meena Sundaram | Patient ID: PAT-99104 | Age: 62 | Gender: Female
Diagnosis: Type 2 Diabetes Mellitus with Right Foot Diabetic Ulcer (Wagner Grade 2)
Procedures: Surgical Debridement of Right Diabetic Foot Ulcer.

MEDICATIONS:
1. Metformin 500 mg - Twice daily with meals.
2. Glimepiride 2 mg - Once daily before breakfast.
3. Amoxicillin-Clavulanate 625 mg - Every 12 hours for 7 days.
4. Paracetamol 500 mg - As needed for wound pain.

ALLERGIES:
Sulfa drugs - severe facial rash.

DIET & WOUND CARE:
Strict Diabetic Diet (1800 kcal).
Daily sterile dressing changes using Povidone-Iodine gauze. Keep wound dry during showers.

FOLLOW-UP:
Endocrinology & Diabetic Foot Clinic on 2026-08-18 at 02:00 PM.

WARNING SIGNS:
Fever > 100.4°F, spreading redness around foot wound, or foul odor.`;

      setTextInput(text);
      setActiveTab('text');
      processExtraction(undefined, text);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 rounded-[28px] bg-white p-8 shadow-xs border border-[#D9D1C5]/60">
        <div className="flex items-center justify-between mb-6 border-b border-[#F5F5F0] pb-4">
          <div>
            <h3 className="font-serif italic text-xl text-[#3E4234] flex items-center gap-2">
              <Upload className="h-5 w-5 text-[#5A5A40]" />
              <span>Step 1 — Upload & Extract Clinical Data</span>
            </h3>
            <p className="text-xs text-[#8C8476] mt-0.5">
              Upload discharge records in PDF, JPG, PNG, or paste clinical text. Local Qwen2.5 engine will extract structured fields and flag FOUND, MISSING, and UNCLEAR values.
            </p>
          </div>

          {/* Quick Demo Sample Loaders */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[#8C8476]">Quick Demo Samples:</span>
            <button
              type="button"
              onClick={() => loadSampleData('angioplasty')}
              className="rounded-xl bg-[#F5F5F0] px-3 py-1.5 text-xs font-semibold text-[#3E4234] hover:bg-[#D9D1C5] transition-colors cursor-pointer border border-[#D9D1C5]"
            >
              Angioplasty
            </button>
            <button
              type="button"
              onClick={() => loadSampleData('diabetic_foot')}
              className="rounded-xl bg-[#F5F5F0] px-3 py-1.5 text-xs font-semibold text-[#3E4234] hover:bg-[#D9D1C5] transition-colors cursor-pointer border border-[#D9D1C5]"
            >
              Diabetic Foot
            </button>
          </div>
        </div>

        {/* Tab Selection: File vs Text */}
        <div className="flex gap-2 mb-6 bg-[#F5F5F0] p-1 rounded-2xl w-fit border border-[#D9D1C5]/60">
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'file' ? 'bg-[#5A5A40] text-white shadow-xs font-bold' : 'text-[#8C8476] hover:text-[#3E4234]'
            }`}
          >
            <FileText className="h-3.5 w-3.5" /> File Upload (PDF / Image)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'text' ? 'bg-[#5A5A40] text-white shadow-xs font-bold' : 'text-[#8C8476] hover:text-[#3E4234]'
            }`}
          >
            <FileCode className="h-3.5 w-3.5" /> Paste Clinical Text
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#BC8F8F]/15 p-3.5 text-xs text-[#8C4A4A] border border-[#BC8F8F]/30 font-medium">
            <AlertCircle className="h-4 w-4 text-[#8C4A4A] shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* File Upload Area */}
        {activeTab === 'file' ? (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-[#D9D1C5] bg-[#F5F5F0]/50 p-8 text-center transition-all hover:border-[#5A5A40] hover:bg-[#EBE7E0]/50 cursor-pointer">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5A5A40]/10 text-[#5A5A40] mb-3">
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-[#3E4234]">
                Click or drag & drop discharge file here
              </p>
              <p className="text-xs text-[#8C8476] mt-1">
                Supports PDF, JPG, JPEG, PNG (Up to 15 MB)
              </p>
              <input
                type="file"
                accept=".pdf,image/png,image/jpeg,image/jpg"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {file && (
              <div className="flex items-center justify-between rounded-2xl border border-[#D9D1C5] bg-[#F5F5F0] p-3.5 text-xs">
                <div className="flex items-center gap-3">
                  {file.type.startsWith('image/') ? (
                    <ImageIcon className="h-5 w-5 text-[#5A5A40]" />
                  ) : (
                    <FileText className="h-5 w-5 text-[#BC8F8F]" />
                  )}
                  <div>
                    <div className="font-bold text-[#3E4234]">{file.name}</div>
                    <div className="text-[10px] text-[#8C8476]">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPreviewUrl(null);
                  }}
                  className="text-[#8C8476] hover:text-[#3E4234] text-xs font-semibold cursor-pointer"
                >
                  Remove
                </button>
              </div>
            )}

            {previewUrl && (
              <div className="mt-2 rounded-2xl border border-[#D9D1C5] p-2 bg-[#F5F5F0] max-h-48 overflow-hidden flex justify-center">
                <img src={previewUrl} alt="Preview" className="max-h-44 object-contain rounded-xl" />
              </div>
            )}
          </div>
        ) : (
          <div>
            <textarea
              rows={8}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste raw hospital discharge summary, clinical progress notes, or physician instructions here..."
              className="w-full rounded-2xl border border-[#D9D1C5] p-4 text-xs text-[#3E4234] font-mono focus:border-[#5A5A40] focus:bg-white focus:outline-none bg-[#F5F5F0]/50 transition-all"
            />
          </div>
        )}

        {/* Loading Progress State */}
        {isLoading ? (
          <div className="mt-6 rounded-2xl bg-[#5A5A40]/10 p-5 border border-[#5A5A40]/20 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <RefreshCw className="h-5 w-5 text-[#5A5A40] animate-spin" />
              <span className="text-sm font-bold text-[#3E4234]">{extractionStage}</span>
            </div>
            <div className="w-full bg-[#D9D1C5] h-2 rounded-full overflow-hidden mt-3">
              <div className="bg-[#5A5A40] h-full animate-pulse w-3/4 rounded-full"></div>
            </div>
            <p className="text-[11px] text-[#8C8476] mt-2 font-medium">
              Local Qwen2.5 clinical extraction engine is extracting patient details, diagnoses, medications, allergies, and restrictions.
            </p>
          </div>
        ) : (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => processExtraction()}
              className="flex items-center gap-2 rounded-2xl bg-[#5A5A40] px-6 py-3 text-xs font-bold text-white shadow-xs hover:bg-[#4A4A34] active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
            >
              <span>EXTRACT CLINICAL INFORMATION</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
