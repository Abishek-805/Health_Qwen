import React, { useState } from 'react';
import { Settings, ShieldCheck, Building2, Languages, UserCheck, CheckCircle2 } from 'lucide-react';
import { HospitalInfo, SupportedLanguage } from '../types/discharge';

interface Props {
  hospitalInfo: HospitalInfo;
  setHospitalInfo: React.Dispatch<React.SetStateAction<HospitalInfo>>;
  clinicianName: string;
  setClinicianName: (name: string) => void;
}

export const SettingsPage: React.FC<Props> = ({
  hospitalInfo,
  setHospitalInfo,
  clinicianName,
  setClinicianName,
}) => {
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="mx-auto max-w-4xl p-8 space-y-6">
      <div className="rounded-[28px] bg-white p-8 shadow-xs border border-[#D9D1C5]/60">
        <div className="flex items-center gap-3 border-b border-[#F5F5F0] pb-4 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5A5A40] text-white shadow-xs">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif italic text-xl text-[#3E4234]">
              Hospital & Safety System Configuration
            </h3>
            <p className="text-xs text-[#8C8476] mt-0.5">
              Customize hospital branding, default language settings, and clinical clinician credentials.
            </p>
          </div>
        </div>

        {saved && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl bg-[#5A5A40]/10 p-3.5 text-xs font-bold text-[#5A5A40] border border-[#5A5A40]/20">
            <CheckCircle2 className="h-4 w-4 text-[#5A5A40]" />
            <span>Settings saved successfully!</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Hospital Info */}
          <div className="space-y-4">
            <h4 className="font-serif italic text-base text-[#3E4234] flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#5A5A40]" /> Hospital Metadata & Headers
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[#8C8476] block mb-1">Hospital / Health Center Name</label>
                <input
                  type="text"
                  value={hospitalInfo.name}
                  onChange={(e) => setHospitalInfo((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-2xl border border-[#D9D1C5] bg-[#F5F5F0]/50 p-3 text-xs font-bold text-[#3E4234] focus:border-[#5A5A40] focus:bg-white focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#8C8476] block mb-1">Department / Specialty</label>
                <input
                  type="text"
                  value={hospitalInfo.department}
                  onChange={(e) => setHospitalInfo((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full rounded-2xl border border-[#D9D1C5] bg-[#F5F5F0]/50 p-3 text-xs font-medium text-[#3E4234] focus:border-[#5A5A40] focus:bg-white focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Attending Clinician Settings */}
          <div className="space-y-4 border-t border-[#F5F5F0] pt-6">
            <h4 className="font-serif italic text-base text-[#3E4234] flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-[#5A5A40]" /> Active Clinician Profile
            </h4>

            <div>
              <label className="text-xs font-semibold text-[#8C8476] block mb-1">Attending Clinician Name & Credentials</label>
              <input
                type="text"
                value={clinicianName}
                onChange={(e) => setClinicianName(e.target.value)}
                className="w-full rounded-2xl border border-[#D9D1C5] bg-[#F5F5F0]/50 p-3 text-xs font-bold text-[#3E4234] focus:border-[#5A5A40] focus:bg-white focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Safety Engine Settings */}
          <div className="space-y-4 border-t border-[#F5F5F0] pt-6">
            <h4 className="font-serif italic text-base text-[#3E4234] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#5A5A40]" /> Safety & Hybrid Audit Rules
            </h4>

            <div className="rounded-2xl bg-[#F5F5F0] p-4 border border-[#D9D1C5]/60 text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#3E4234]">Deterministic ID & Dosage Checks</span>
                <span className="text-[#5A5A40] font-bold">ENABLED (STRICT)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#3E4234]">Semantic AI Meaning Reversal Detection</span>
                <span className="text-[#5A5A40] font-bold">ENABLED (LOCAL ENGINE)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#3E4234]">CRITICAL_ISSUE Hard Stop Approval Lock</span>
                <span className="text-[#BC8F8F] font-bold">ENFORCED</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#F5F5F0] pt-6 flex justify-end">
            <button
              type="submit"
              className="rounded-2xl bg-[#5A5A40] px-6 py-3 text-xs font-bold text-white shadow-xs hover:bg-[#4A4A34] cursor-pointer transition-all uppercase tracking-wider"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
