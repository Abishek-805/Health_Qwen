import React from 'react';
import {
  LayoutDashboard,
  FilePlus2,
  ListTodo,
  Users,
  FileClock,
  Settings,
  ShieldCheck,
  Building2,
  UserCheck,
} from 'lucide-react';
import { AiStatusIndicator } from '../common/AiStatusIndicator';

interface Props {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  clinicianName: string;
  setClinicianName: (name: string) => void;
  pendingReviewCount: number;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  setActiveTab,
  clinicianName,
  setClinicianName,
  pendingReviewCount,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'create', label: 'Create Instructions', icon: FilePlus2, badge: '6-Step' },
    {
      id: 'review-queue',
      label: 'Review Queue',
      icon: ListTodo,
      badge: pendingReviewCount > 0 ? `${pendingReviewCount}` : undefined,
    },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'documents', label: 'Documents & History', icon: FileClock },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="flex h-screen w-64 flex-col justify-between bg-[#EBE7E0] text-[#3E4234] shadow-xs border-r border-[#D9D1C5]">
      <div className="flex flex-col gap-6 p-5">
        {/* Brand Header */}
        <div className="flex items-center gap-3 border-b border-[#D9D1C5] pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#5A5A40] text-white shadow-xs">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif italic text-base font-medium text-[#3E4234] tracking-tight">Clinical Discharge</h1>
            <p className="text-[10px] text-[#665F54] font-semibold uppercase tracking-wider">Human-in-the-Loop AI</p>
          </div>
        </div>

        {/* Local AI Engine Status */}
        <div className="px-0.5">
          <AiStatusIndicator />
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col gap-1.5">
          <p className="text-[10px] uppercase tracking-widest text-[#665F54] font-semibold px-2">Navigation</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#5A5A40] text-white shadow-xs'
                    : 'text-[#3E4234] hover:bg-[#D9D1C5]/60 hover:text-[#2A2D23]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-[#5A5A40]'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-[#D9D1C5] text-[#5A5A40]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Clinician Profile Footer */}
      <div className="border-t border-[#D9D1C5] p-4 bg-[#D9D1C5]/30">
        <div className="flex items-center justify-between text-xs text-[#665F54] mb-2">
          <span className="flex items-center gap-1 font-semibold text-[11px] text-[#5A5A40]">
            <Building2 className="h-3.5 w-3.5 text-[#5A5A40]" /> Local workspace
          </span>
          <span className="text-[10px] bg-[#5A5A40]/10 text-[#5A5A40] px-1.5 py-0.5 rounded-full font-bold border border-[#5A5A40]/20">
            SIGNED IN
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5A5A40] text-white shrink-0">
            <UserCheck className="h-4 w-4" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-xs font-bold text-[#3E4234]">{clinicianName}</p>
            <p className="text-[10px] text-[#665F54] truncate">Clinician account</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
