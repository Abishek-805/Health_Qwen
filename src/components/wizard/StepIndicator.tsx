import React from 'react';
import {
  Upload,
  UserCheck2,
  FileText,
  ShieldAlert,
  Edit3,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  currentStep: number;
  setStep: (step: number) => void;
  maxReachedStep: number;
}

export const StepIndicator: React.FC<Props> = ({ currentStep, setStep, maxReachedStep }) => {
  const steps = [
    { number: 1, name: 'Upload & Extract', icon: Upload, desc: 'PDF / Image / Text' },
    { number: 2, name: 'Verify & Complete', icon: UserCheck2, desc: 'Authoritative Data' },
    { number: 3, name: 'AI Generation', icon: FileText, desc: 'Multilingual Draft' },
    { number: 4, name: '18-Category Audit', icon: ShieldAlert, desc: 'Hybrid Safety' },
    { number: 5, name: 'Review & Edit', icon: Edit3, desc: 'Clinical Adjustments' },
    { number: 6, name: 'Approval & PDF', icon: CheckCircle2, desc: 'Sign-off & Export' },
  ];

  return (
    <div className="w-full bg-white/80 border-b border-[#D9D1C5] px-6 py-3.5 shadow-2xs backdrop-blur-xs">
      <div className="mx-auto max-w-6xl flex items-center justify-between">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = currentStep === step.number;
          const isCompleted = currentStep > step.number;
          const isAccessible = step.number <= maxReachedStep;

          return (
            <React.Fragment key={step.number}>
              <button
                disabled={!isAccessible}
                onClick={() => isAccessible && setStep(step.number)}
                className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-2 transition-all ${
                  isActive
                    ? 'bg-[#5A5A40] text-white shadow-xs'
                    : isCompleted
                    ? 'bg-[#EBE7E0] text-[#3E4234] border border-[#D9D1C5] hover:bg-[#D9D1C5] cursor-pointer'
                    : isAccessible
                    ? 'bg-[#F5F5F0] text-[#3E4234] hover:bg-[#EBE7E0] cursor-pointer'
                    : 'bg-[#F5F5F0]/50 text-[#8C8476] opacity-50 cursor-not-allowed'
                }`}
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    isActive
                      ? 'bg-white text-[#5A5A40]'
                      : isCompleted
                      ? 'bg-[#5A5A40] text-white'
                      : 'bg-[#D9D1C5] text-[#5A5A40]'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.number}
                </div>

                <div className="text-left hidden lg:block">
                  <div className="text-xs font-bold leading-tight">{step.name}</div>
                  <div
                    className={`text-[10px] ${
                      isActive ? 'text-white/80' : isCompleted ? 'text-[#5A5A40]' : 'text-[#8C8476]'
                    }`}
                  >
                    {step.desc}
                  </div>
                </div>
              </button>

              {idx < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-1.5 hidden sm:block ${
                    currentStep > step.number ? 'bg-[#5A5A40]' : 'bg-[#D9D1C5]'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
