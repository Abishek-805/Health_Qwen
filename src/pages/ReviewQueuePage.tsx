import React from 'react';
import { ListTodo, AlertTriangle, ShieldCheck, FileCheck, ArrowRight, Download } from 'lucide-react';
import { DischargeDocument } from '../types/discharge';
import { StatusBadge } from '../components/common/StatusBadge';
import { generateDischargePdf } from '../utils/pdfGenerator';

interface Props {
  documents: DischargeDocument[];
  onSelectDocumentForReview: (doc: DischargeDocument) => void;
}

export const ReviewQueuePage: React.FC<Props> = ({ documents, onSelectDocumentForReview }) => {
  const pendingDocs = documents.filter(
    (d) => d.approvalStatus !== 'APPROVED' || d.auditResult?.overallStatus === 'CRITICAL_ISSUE'
  );

  return (
    <div className="mx-auto max-w-6xl p-8 space-y-6">
      <div className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D2B48C] text-white shadow-xs">
              <ListTodo className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif italic text-xl text-[#3E4234]">
                Clinical Review & Sign-Off Queue ({pendingDocs.length})
              </h3>
              <p className="text-xs text-[#8C8476] mt-0.5">
                Discharge documents requiring attending physician review, audit verification, or approval signature.
              </p>
            </div>
          </div>
        </div>
      </div>

      {pendingDocs.length === 0 ? (
        <div className="rounded-[28px] bg-[#EBE7E0] border border-[#D9D1C5] p-12 text-center text-[#3E4234]">
          <ShieldCheck className="h-12 w-12 text-[#5A5A40] mx-auto mb-3" />
          <h4 className="font-serif italic text-xl">Review Queue Clear!</h4>
          <p className="text-xs text-[#8C8476] mt-1">
            All generated discharge handouts have passed safety audit and received clinician approval.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {pendingDocs.map((doc) => {
            const audit = doc.auditResult;
            const isCritical = audit?.overallStatus === 'CRITICAL_ISSUE';

            return (
              <div
                key={doc.id}
                className={`rounded-[28px] bg-white p-6 shadow-xs border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isCritical ? 'border-[#BC8F8F] bg-[#BC8F8F]/5' : 'border-[#D9D1C5]/60'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-serif italic text-lg text-[#3E4234]">
                      {doc.verifiedData?.patient.name.value || 'Unnamed Patient'}
                    </span>
                    <span className="text-xs font-mono text-[#5A5A40] font-bold">
                      ({doc.verifiedData?.patient.patientId.value || 'N/A'})
                    </span>
                    <span className="text-xs font-bold text-[#8C8476] uppercase">
                      • Language: {doc.generatedReport?.language || 'en'}
                    </span>
                  </div>

                  <p className="text-xs text-[#8C8476]">
                    Version: <strong>v{doc.generatedReport?.version || 1}</strong> • Updated:{' '}
                    {new Date(doc.updatedAt).toLocaleString()}
                  </p>

                  {audit && (
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-xs text-[#8C8476] font-medium">Audit Results:</span>
                      <StatusBadge status={audit.overallStatus} size="sm" />
                      <span className="text-xs text-[#8C8476]">
                        ({audit.criticalCount} Critical, {audit.warningCount} Warnings)
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => generateDischargePdf(doc)}
                    className="rounded-2xl border border-[#D9D1C5] p-2.5 text-[#5A5A40] hover:bg-[#F5F5F0] cursor-pointer transition-colors"
                    title="Preview PDF"
                  >
                    <Download className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => onSelectDocumentForReview(doc)}
                    className="flex items-center gap-2 rounded-2xl bg-[#5A5A40] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#4A4A34] cursor-pointer transition-all uppercase tracking-wider"
                  >
                    <span>Review & Sign</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
