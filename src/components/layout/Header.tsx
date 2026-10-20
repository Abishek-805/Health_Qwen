import React from 'react';
import { User, X, FilePlus2, ShieldCheck, HeartPulse } from 'lucide-react';

interface Props {
  activeTab: string;
  activePatientName?: string;
  activePatientId?: string;
  onClearPatientContext?: () => void;
  onStartNewDocument?: () => void;
  hospitalName: string;
}

export const Header: React.FC<Props> = ({
  activeTab,
  activePatientName,
  activePatientId,
  onClearPatientContext,
  onStartNewDocument,
  hospitalName,
}) => {
  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Clinical Overview Dashboard';
      case 'create':
        return 'Discharge Instructions Wizard';
      case 'review-queue':
        return 'Clinical Review & Approval Queue';
      case 'patients':
        return 'Patient Records Directory';
      case 'documents':
        return 'Discharge History & Document Repository';
      case 'settings':
        return 'System & Safety Configuration';
      default:
        return 'Healthcare Discharge Engine';
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#D9D1C5] bg-white/60 px-8 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <div>
          <h2 className="font-serif italic text-2xl text-[#3E4234] tracking-tight">{getTabTitle()}</h2>
          <p className="text-xs text-[#665F54] font-medium flex items-center gap-1.5 mt-0.5">
            <HeartPulse className="h-3.5 w-3.5 text-[#5A5A40]" />
            <span>{hospitalName}</span>
          </p>
        </div>

        {/* Active Patient Context Badge with Clear Button */}
        {activePatientName && (
          <div className="flex items-center gap-2 rounded-full border border-[#D9D1C5] bg-[#F5F5F0] px-3.5 py-1 text-xs text-[#3E4234] shadow-2xs">
            <User className="h-3.5 w-3.5 text-[#5A5A40]" />
            <span className="font-semibold">Patient: {activePatientName}</span>
            <span className="text-[#665F54] font-mono text-[11px]">({activePatientId})</span>
            {onClearPatientContext && (
              <button
                onClick={onClearPatientContext}
                title="Clear Patient Context (Ensures Patient Isolation)"
                className="ml-1 rounded-full p-0.5 text-[#665F54] hover:bg-[#D9D1C5] hover:text-[#3E4234] transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {activeTab !== 'create' && onStartNewDocument && (
          <button
            onClick={onStartNewDocument}
            className="flex items-center gap-2 rounded-2xl bg-[#5A5A40] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#4A4A34] active:scale-95 transition-all cursor-pointer"
          >
            <FilePlus2 className="h-4 w-4" />
            <span>New Instructions</span>
          </button>
        )}

        <div className="hidden md:flex items-center gap-1.5 rounded-full border border-[#D9D1C5] bg-[#EBE7E0] px-3 py-1.5 text-[11px] font-semibold text-[#5A5A40]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#5A5A40]" />
          <span>VERIFIED SOURCE OF TRUTH MODE</span>
        </div>
      </div>
    </header>
  );
};
