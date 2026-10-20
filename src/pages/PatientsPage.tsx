import React, { useState } from 'react';
import { Users, Search, UserPlus, FilePlus2, ChevronRight, Stethoscope, HeartPulse } from 'lucide-react';
import { DischargeDocument } from '../types/discharge';

interface Props {
  documents: DischargeDocument[];
  onSelectPatient: (patientName: string, patientId: string) => void;
  onStartNewDocumentForPatient: (patientName: string, patientId: string) => void;
}

export const PatientsPage: React.FC<Props> = ({
  documents,
  onSelectPatient,
  onStartNewDocumentForPatient,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Extract unique patients from documents repository
  const patientMap = new Map<string, {
    name: string;
    id: string;
    age: string;
    gender: string;
    lastDischargeDate: string;
    docCount: number;
    diagnosis: string;
  }>();


  documents.forEach((d) => {
    if (d.verifiedData?.patient) {
      const p = d.verifiedData.patient;
      const id = p.patientId.value || 'N/A';
      const name = p.name.value || 'Patient';
      const existing = patientMap.get(id);
      if (existing) {
        existing.docCount += 1;
      } else {
        patientMap.set(id, {
          name,
          id,
          age: `${p.age.value || 'N/A'} Yrs`,
          gender: p.gender.value || 'N/A',
          lastDischargeDate: new Date(d.updatedAt).toISOString().split('T')[0],
          docCount: 1,
          diagnosis: d.verifiedData.diagnosis[0]?.value || 'Clinical Admission',
        });
      }
    }
  });

  const patientsList = Array.from(patientMap.values()).filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.diagnosis.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-6xl p-8 space-y-6">
      <div className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-serif italic text-xl text-[#3E4234] flex items-center gap-2">
            <Users className="h-5 w-5 text-[#5A5A40]" /> Patient Records Directory
          </h3>
          <p className="text-xs text-[#665F54] mt-0.5">
            Search patient records, inspect historic discharge handouts, and launch isolated clinical instruction wizards.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#665F54]" />
          <input aria-label="Search by Patient Name, ID or Diagnosis..."
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Patient Name, ID or Diagnosis..."
            className="w-full rounded-2xl border border-[#D9D1C5] bg-[#F5F5F0]/50 pl-10 pr-4 py-2.5 text-xs font-medium text-[#3E4234] focus:border-[#5A5A40] focus:bg-white focus:outline-none transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {patientsList.map((patient) => (
          <div
            key={patient.id}
            className="rounded-[28px] bg-white p-6 shadow-xs border border-[#D9D1C5]/60 hover:border-[#5A5A40] transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between border-b border-[#F5F5F0] pb-3 mb-3">
                <div>
                  <h4 className="font-serif italic text-lg text-[#3E4234]">{patient.name}</h4>
                  <span className="text-xs font-mono text-[#5A5A40] font-bold">ID: {patient.id}</span>
                </div>
                <span className="rounded-full bg-[#F5F5F0] text-[#5A5A40] px-3 py-1 text-xs font-semibold border border-[#D9D1C5]/50">
                  {patient.age} / {patient.gender}
                </span>
              </div>

              <div className="text-xs text-[#3E4234] space-y-1.5 mb-4">
                <div className="flex items-center gap-1.5 font-medium">
                  <Stethoscope className="h-3.5 w-3.5 text-[#5A5A40] shrink-0" />
                  <span className="truncate">{patient.diagnosis}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#665F54]">
                  <HeartPulse className="h-3.5 w-3.5 text-[#665F54] shrink-0" />
                  <span>Last discharge: {patient.lastDischargeDate} • {patient.docCount} Handout(s)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#F5F5F0] pt-3">
              <button
                onClick={() => onSelectPatient(patient.name, patient.id)}
                className="text-xs font-bold text-[#665F54] hover:text-[#5A5A40] cursor-pointer transition-colors"
              >
                Set Active Context
              </button>

              <button
                onClick={() => onStartNewDocumentForPatient(patient.name, patient.id)}
                className="flex items-center gap-1.5 rounded-xl bg-[#5A5A40] px-4 py-2 text-xs font-bold text-white hover:bg-[#4A4A34] cursor-pointer shadow-xs transition-all"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                <span>New Handout</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
