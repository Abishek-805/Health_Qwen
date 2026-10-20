import React from 'react';
import {
  AuditCategoryStatus,
  AuditSeverity,
  FieldStatus,
  ApprovalStatus,
} from '../../types/discharge';

interface Props {
  status: AuditCategoryStatus | FieldStatus | ApprovalStatus | AuditSeverity | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<Props> = ({ status = 'N/A', size = 'md', className = '' }) => {
  let bgClass = 'bg-slate-100 text-slate-700 border-slate-200';

  const s = (status || 'N/A').toString().toUpperCase();

  switch (s) {
    case 'PASS':
    case 'FOUND':
    case 'APPROVED':
    case 'READY_FOR_HUMAN_APPROVAL':
    case 'LOW':
      bgClass = 'bg-[#5A5A40]/15 text-[#4A4A34] border-[#5A5A40]/30 font-bold';
      break;
    case 'REVIEW_REQUIRED':
    case 'UNCLEAR':
    case 'NEEDS_REVIEW':
    case 'AUDITED':
    case 'MEDIUM':
    case 'HIGH':
      bgClass = 'bg-[#D2B48C]/25 text-[#7A5A30] border-[#D2B48C]/50 font-bold';
      break;
    case 'CRITICAL_ISSUE':
    case 'CRITICAL':
    case 'MISSING':
    case 'DO_NOT_APPROVE':
      bgClass = 'bg-[#BC8F8F]/25 text-[#8C4A4A] border-[#BC8F8F]/50 font-bold';
      break;
    case 'NOT_EVALUATED':
    case 'NOT_APPLICABLE':
    case 'DRAFT':
    case 'VERIFIED':
    case 'GENERATED':
      bgClass = 'bg-[#EBE7E0] text-[#3E4234] border-[#D9D1C5] font-semibold';
      break;
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${sizeClasses[size]} ${bgClass} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
      {(s || 'N/A').replace(/_/g, ' ')}
    </span>
  );
};
