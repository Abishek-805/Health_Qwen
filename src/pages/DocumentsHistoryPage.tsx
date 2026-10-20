import React, { useState } from 'react';
import { FileClock, Search, Download, Eye, Sparkles, X, ShieldAlert } from 'lucide-react';
import { DischargeDocument } from '../types/discharge';
import { StatusBadge } from '../components/common/StatusBadge';
import { generateDischargePdf } from '../utils/pdfGenerator';

interface Props {
  documents: DischargeDocument[];
  onSelectDocument: (doc: DischargeDocument) => void;
}

export const DocumentsHistoryPage: React.FC<Props> = ({ documents, onSelectDocument }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [langFilter, setLangFilter] = useState<string>('ALL');
  const [viewDocModal, setViewDocModal] = useState<DischargeDocument | null>(null);

  const filteredDocs = documents.filter((d) => {
    const name = d.verifiedData?.patient.name.value || '';
    const pid = d.verifiedData?.patient.patientId.value || '';
    const matchesSearch =
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pid.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' || d.approvalStatus === statusFilter || d.auditResult?.overallStatus === statusFilter;

    const matchesLang = langFilter === 'ALL' || d.generatedReport?.language === langFilter;

    return matchesSearch && matchesStatus && matchesLang;
  });

  return (
    <div className="mx-auto max-w-7xl p-8 space-y-6">
      <div className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-serif italic text-xl text-[#3E4234] flex items-center gap-2">
            <FileClock className="h-5 w-5 text-[#5A5A40]" /> Discharge History & Document Repository
          </h3>
          <p className="text-xs text-[#665F54] mt-0.5">
            Audit logs, multi-version discharge history, and exportable English A4 handouts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#665F54]" />
            <input aria-label="Search patient or ID..."
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search patient or ID..."
              className="rounded-2xl border border-[#D9D1C5] bg-[#F5F5F0]/50 pl-8 pr-3 py-1.5 text-xs text-[#3E4234] focus:outline-none focus:border-[#5A5A40] transition-all"
            />
          </div>

          <select aria-label="Filter approval status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-[#D9D1C5] px-3 py-1.5 text-xs font-semibold text-[#3E4234] bg-white cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
            <option value="CRITICAL_ISSUE">Critical Safety Issue</option>
          </select>

          <select aria-label="Filter report language"
            value={langFilter}
            onChange={(e) => setLangFilter(e.target.value)}
            className="rounded-2xl border border-[#D9D1C5] px-3 py-1.5 text-xs font-semibold text-[#3E4234] bg-white cursor-pointer"
          >
            <option value="ALL">All Languages</option>
            <option value="en">English (en)</option>
          </select>
        </div>
      </div>

      <div className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#F5F5F0] text-[#665F54] text-[10px] uppercase tracking-wider font-semibold border-b border-[#D9D1C5]/60">
                <th className="p-3.5 rounded-l-xl">Patient Name & ID</th>
                <th className="p-3.5">Language</th>
                <th className="p-3.5">Version</th>
                <th className="p-3.5">Audit Verdict</th>
                <th className="p-3.5">Approval</th>
                <th className="p-3.5">Approved By</th>
                <th className="p-3.5 text-right rounded-r-xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5F5F0]">
              {filteredDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-[#F5F5F0]/60 transition-colors">
                  <td className="p-3.5">
                    <div className="font-serif italic text-base text-[#3E4234]">
                      {doc.verifiedData?.patient.name.value || 'Unnamed Patient'}
                    </div>
                    <div className="text-[10px] font-mono text-[#5A5A40] font-bold">
                      {doc.verifiedData?.patient.patientId.value || 'N/A'}
                    </div>
                  </td>
                  <td className="p-3.5 uppercase font-bold text-[#3E4234]">
                    {doc.generatedReport?.language || 'en'}
                  </td>
                  <td className="p-3.5 font-bold text-[#5A5A40]">v{doc.generatedReport?.version || 1}</td>
                  <td className="p-3.5">
                    <StatusBadge status={doc.auditResult?.overallStatus || 'PASS'} size="sm" />
                  </td>
                  <td className="p-3.5">
                    <StatusBadge status={doc.approvalStatus} size="sm" />
                  </td>
                  <td className="p-3.5 text-[#665F54]">
                    {doc.approvedBy ? `${doc.approvedBy.name} (${doc.approvedBy.role})` : 'Unsigned'}
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setViewDocModal(doc)}
                        className="rounded-xl bg-[#F5F5F0] p-1.5 text-[#5A5A40] hover:bg-[#D9D1C5] cursor-pointer transition-colors"
                        title="View Handout Details"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => generateDischargePdf(doc)}
                        className="rounded-xl bg-[#5A5A40] p-1.5 text-white hover:bg-[#4A4A34] cursor-pointer shadow-xs transition-colors"
                        title="Download A4 PDF"
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

      {/* Modal View for Document Details */}
      {viewDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3E4234]/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl rounded-[32px] bg-white p-8 shadow-2xl border border-[#D9D1C5] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F5F5F0] pb-4 mb-6">
              <div className="flex items-center gap-2">
                <FileClock className="h-5 w-5 text-[#5A5A40]" />
                <h3 className="font-serif italic text-xl text-[#3E4234]">
                  Discharge Instructions — {viewDocModal.verifiedData?.patient.name.value} (v
                  {viewDocModal.generatedReport?.version})
                </h3>
              </div>
              <button
                onClick={() => setViewDocModal(null)}
                className="rounded-full p-1.5 text-[#665F54] hover:bg-[#F5F5F0] hover:text-[#3E4234] cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="rounded-2xl bg-[#F5F5F0] p-4 border border-[#D9D1C5]/60">
                <h4 className="font-serif italic text-base text-[#3E4234] mb-1">Summary & Overview</h4>
                <p className="text-[#3E4234]/80 leading-relaxed">
                  {viewDocModal.generatedReport?.sections.summary}
                </p>
              </div>

              <div className="rounded-2xl bg-[#F5F5F0] p-4 border border-[#D9D1C5]/60">
                <h4 className="font-serif italic text-base text-[#3E4234] mb-1">Verified Medications</h4>
                <div className="space-y-1">
                  {viewDocModal.verifiedData?.medications.map((m, idx) => (
                    <div key={idx} className="font-mono text-[#3E4234]">
                      • <strong>{m.name}</strong>: {m.dosage} ({m.frequency})
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-[#EBE7E0] p-4 border border-[#D9D1C5] text-[#3E4234]">
                <h4 className="font-serif italic text-base text-[#3E4234] mb-1">18-Category Audit Verdict</h4>
                <div className="flex items-center gap-2 mb-2">
                  <StatusBadge status={viewDocModal.auditResult?.overallStatus || 'PASS'} />
                  <span className="font-semibold text-xs">Recommendation: {viewDocModal.auditResult?.approvalRecommendation}</span>
                </div>
                <p className="text-xs text-[#665F54]">{viewDocModal.auditResult?.summary}</p>
              </div>
            </div>

            <div className="mt-8 flex justify-between border-t border-[#F5F5F0] pt-4">
              <button
                onClick={() => {
                  setViewDocModal(null);
                  onSelectDocument(viewDocModal);
                }}
                className="rounded-2xl bg-[#5A5A40] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#4A4A34] cursor-pointer transition-all"
              >
                Open in Review Wizard
              </button>
              <button
                onClick={() => generateDischargePdf(viewDocModal)}
                className="rounded-2xl bg-[#EBE7E0] border border-[#D9D1C5] px-6 py-2.5 text-xs font-bold text-[#3E4234] hover:bg-[#D9D1C5] cursor-pointer transition-all"
              >
                Download A4 PDF Handout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
