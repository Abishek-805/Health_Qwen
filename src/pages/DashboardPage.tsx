import React from 'react';
import {
  FileText,
  ListTodo,
  CheckCircle2,
  AlertTriangle,
  FilePlus2,
  User,
  ArrowRight,
  Download,
  Clock,
  Sparkles,
} from 'lucide-react';
import { DischargeDocument } from '../types/discharge';
import { StatusBadge } from '../components/common/StatusBadge';
import { generateDischargePdf } from '../utils/pdfGenerator';

interface Props {
  documents: DischargeDocument[];
  onStartNewDocument: () => void;
  onSelectDocument: (doc: DischargeDocument) => void;
  onSelectPatient: (patientName: string, patientId: string) => void;
}

export const DashboardPage: React.FC<Props> = ({
  documents,
  onStartNewDocument,
  onSelectDocument,
  onSelectPatient,
}) => {
  const totalCount = documents.length;
  const pendingCount = documents.filter(
    (d) => d.approvalStatus === 'NEEDS_REVIEW' || d.approvalStatus === 'AUDITED' || d.approvalStatus === 'DRAFT'
  ).length;
  const approvedCount = documents.filter((d) => d.approvalStatus === 'APPROVED').length;
  const criticalCount = documents.filter((d) => d.auditResult?.overallStatus === 'CRITICAL_ISSUE').length;

  return (
    <div className="mx-auto max-w-7xl p-8 space-y-8">
      {/* Top Banner */}
      <div className="rounded-[32px] bg-[#5A5A40] text-white p-8 shadow-xs border border-[#D9D1C5] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/20 text-white px-3 py-0.5 text-xs font-semibold tracking-wide border border-white/30">
              CLINICAL AI ENGINE v3.6
            </span>
            <span className="text-white/70 text-xs italic">• Human-in-the-Loop Safety</span>
          </div>
          <h1 className="font-serif italic text-2xl md:text-3xl font-normal tracking-tight text-white">
            Healthcare Discharge Instructions Generator
          </h1>
          <p className="text-xs text-white/80 max-w-2xl leading-relaxed">
            Multimodal clinical extraction, 18-category hybrid safety audit, and multilingual A4 PDF generation anchored strictly to clinician-verified patient data.
          </p>
        </div>

        <button
          onClick={onStartNewDocument}
          className="relative z-10 flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-xs font-bold text-[#5A5A40] shadow-xs hover:bg-[#FAF9F6] active:scale-95 transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider"
        >
          <FilePlus2 className="h-4 w-4" />
          <span>New Discharge Instructions</span>
        </button>

        <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#8C8476] font-semibold block">Total Documents</span>
            <span className="text-3xl font-light text-[#3E4234] mt-1 block">{totalCount}</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F5F0] text-[#5A5A40]">
            <FileText className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#8C8476] font-semibold block">Pending Review</span>
            <span className="text-3xl font-light text-[#D2B48C] mt-1 block">{pendingCount}</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F5F0] text-[#D2B48C]">
            <ListTodo className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#8C8476] font-semibold block">Approved Documents</span>
            <span className="text-3xl font-light text-[#5A5A40] mt-1 block">{approvedCount}</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F5F5F0] text-[#5A5A40]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#8C8476] font-semibold block">Critical Safety Flags</span>
            <span className="text-3xl font-light text-[#BC8F8F] mt-1 block">{criticalCount}</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#BC8F8F]/10 text-[#BC8F8F]">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Recent Documents Table */}
      <div className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-serif italic text-xl text-[#3E4234]">
              Recent Discharge Documents
            </h3>
            <p className="text-xs text-[#8C8476] mt-0.5">
              Click any record to inspect audit findings or download multilingual A4 PDF handouts.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#F5F5F0] text-[#8C8476] text-[10px] uppercase tracking-wider font-semibold border-b border-[#D9D1C5]/60">
                <th className="p-3.5 rounded-l-xl">Patient</th>
                <th className="p-3.5">Patient ID</th>
                <th className="p-3.5">Language</th>
                <th className="p-3.5">Version</th>
                <th className="p-3.5">Audit Status</th>
                <th className="p-3.5">Approval Status</th>
                <th className="p-3.5">Last Updated</th>
                <th className="p-3.5 text-right rounded-r-xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F5F0]">
              {documents.slice(0, 8).map((doc) => (
                <tr key={doc.id} className="hover:bg-[#F5F5F0]/60 transition-colors">
                  <td className="p-3.5 font-bold text-[#3E4234]">
                    <button
                      onClick={() =>
                        onSelectPatient(
                          doc.verifiedData?.patient.name.value || 'Patient',
                          doc.verifiedData?.patient.patientId.value || 'N/A'
                        )
                      }
                      className="hover:underline text-[#5A5A40] cursor-pointer"
                    >
                      {doc.verifiedData?.patient.name.value || 'Unnamed Patient'}
                    </button>
                  </td>
                  <td className="p-3.5 font-mono text-[#8C8476] font-bold">
                    {doc.verifiedData?.patient.patientId.value || 'N/A'}
                  </td>
                  <td className="p-3.5 uppercase font-bold text-[#3E4234]">
                    {doc.generatedReport?.language || 'en'}
                  </td>
                  <td className="p-3.5 font-bold text-[#5A5A40]">
                    v{doc.generatedReport?.version || 1}
                  </td>
                  <td className="p-3.5">
                    <StatusBadge status={doc.auditResult?.overallStatus || 'PASS'} size="sm" />
                  </td>
                  <td className="p-3.5">
                    <StatusBadge status={doc.approvalStatus} size="sm" />
                  </td>
                  <td className="p-3.5 text-[#8C8476]">
                    {new Date(doc.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onSelectDocument(doc)}
                        className="rounded-xl bg-[#5A5A40]/10 px-3 py-1.5 font-bold text-[#5A5A40] hover:bg-[#5A5A40] hover:text-white transition-all cursor-pointer text-[11px]"
                      >
                        Review
                      </button>
                      <button
                        onClick={() => generateDischargePdf(doc)}
                        className="rounded-xl bg-[#F5F5F0] p-1.5 text-[#5A5A40] hover:bg-[#D9D1C5] cursor-pointer transition-colors"
                        title="Download PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
