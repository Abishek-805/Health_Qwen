import React, { useState } from 'react';
import { HospitalInfo } from '../types/discharge';

interface Props {
  hospitalInfo: HospitalInfo;
  setHospitalInfo: React.Dispatch<React.SetStateAction<HospitalInfo>>;
  clinicianName: string;
  setClinicianName: (name: string) => void;
}
export const SettingsPage: React.FC<Props> = ({ hospitalInfo, setHospitalInfo, clinicianName }) => {
  const [draft, setDraft] = useState(hospitalInfo);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hospitalName: draft.name, department: draft.department }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Settings could not be saved.');
      const saved = await res.json();
      setHospitalInfo({ name: saved.hospitalName, department: saved.department });
      setMessage('Settings saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Settings could not be saved.'); }
    finally { setSaving(false); }
  };
  return <div className="mx-auto max-w-4xl space-y-6 p-8">
    <form onSubmit={handleSave} className="space-y-6 rounded-[28px] border border-[#D9D1C5] bg-white p-8 shadow-xs">
      <h2 className="font-serif text-xl text-[#3E4234]">Workspace settings</h2>
      <div><label htmlFor="hospital-name" className="mb-1 block text-sm">Hospital / health center name</label>
        <input id="hospital-name" required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-2xl border border-[#D9D1C5] p-3" /></div>
      <div><label htmlFor="hospital-department" className="mb-1 block text-sm">Department</label>
        <input id="hospital-department" maxLength={200} value={draft.department} onChange={e => setDraft({ ...draft, department: e.target.value })} className="w-full rounded-2xl border border-[#D9D1C5] p-3" /></div>
      <div><label htmlFor="clinician-account" className="mb-1 block text-sm">Signed-in clinician account</label>
        <input id="clinician-account" readOnly value={clinicianName} className="w-full rounded-2xl border border-[#D9D1C5] bg-[#F5F5F0] p-3" /></div>
      <p className="text-sm text-[#3E4234]">Automated checks are limited. Approval requires a review of the original source and all instructions. Clinical identity comes from the signed-in account.</p>
      <p role="status" aria-live="polite" className="text-sm text-[#3E4234]">{message}</p>
      <button disabled={saving} type="submit" className="rounded-2xl bg-[#5A5A40] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save configuration'}</button>
    </form>
  </div>;
};
