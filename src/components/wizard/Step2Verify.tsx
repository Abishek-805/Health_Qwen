import React, { useState } from 'react';
import {
  UserCheck,
  Plus,
  Trash2,
  Lock,
  ArrowRight,
  Pill,
  Calendar,
  AlertTriangle,
  Stethoscope,
  Activity,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import {
  StructuredDischargeInfo,
  AuthoritativeDischargeData,
  MedicationItem,
  FollowUpItem,
  FieldStatus,
} from '../../types/discharge';
import { StatusBadge } from '../common/StatusBadge';

interface Props {
  extractedData: StructuredDischargeInfo;
  onVerifyComplete: (verified: AuthoritativeDischargeData) => void;
  clinicianName: string;
  onDirtyChange: (dirty: boolean) => void;
}

export function createBlankFollowUp(id: string): FollowUpItem {
  return { id, provider: '', date: '', time: '', location: '', instructions: '', status: 'MISSING' };
}

export function editFollowUp(item: FollowUpItem, field: 'provider' | 'date' | 'time' | 'location' | 'instructions', value: string): FollowUpItem {
  const keys = ['provider', 'date', 'time', 'location', 'instructions'] as const;
  const updated: FollowUpItem = { ...item, [field]: value };
  for (const key of keys) updated[`${key}Status`] = item[`${key}Status`] || (item[key] ? item.status : 'MISSING');
  updated[`${field}Status`] = value.trim() ? 'FOUND' : 'MISSING';
  const statuses = keys.map(key => updated[`${key}Status`]);
  updated.status = statuses.includes('UNCLEAR') ? 'UNCLEAR' : statuses.includes('FOUND') ? 'FOUND' : 'MISSING';
  return updated;
}

export const Step2Verify: React.FC<Props> = ({
  extractedData,
  onVerifyComplete,
  clinicianName,
  onDirtyChange,
}) => {
  const [data, setData] = useState<StructuredDischargeInfo>(extractedData);
  const sourceExcerpts = [
    ...(['name', 'patientId', 'age', 'gender'] as const).map(label => ({ label, quote: extractedData.patient[label].note })),
    ...(['diagnosis', 'procedures', 'allergies', 'diet', 'activityRestrictions', 'woundCare', 'warningSigns', 'emergencyInstructions', 'additionalNotes'] as const)
      .flatMap(section => extractedData[section].map((field, index) => ({ label: `${section} ${index + 1}`, quote: field.note }))),
    ...extractedData.medications.map((med, index) => ({ label: `Medication ${index + 1}`, quote: med.sourceSection })),
    ...extractedData.followUp.map((appointment, index) => ({ label: `Follow-up ${index + 1}`, quote: appointment.sourceSection })),
  ];

  // Helper updater for patient fields
  const updatePatientField = (field: 'name' | 'patientId' | 'age' | 'gender', value: string) => {
    setData((prev) => ({
      ...prev,
      patient: {
        ...prev.patient,
        [field]: {
          ...prev.patient[field],
          value,
          status: value.trim() ? 'FOUND' : 'MISSING',
        },
      },
    }));
  };

  // Helper updater for simple string array fields
  const updateArrayItem = (
    section: 'diagnosis' | 'procedures' | 'allergies' | 'diet' | 'activityRestrictions' | 'woundCare' | 'warningSigns' | 'emergencyInstructions' | 'additionalNotes',
    index: number,
    value: string
  ) => {
    setData((prev) => {
      const updated = [...prev[section]];
      updated[index] = {
        ...updated[index],
        value,
        status: value.trim() ? 'FOUND' : 'MISSING',
      };
      return { ...prev, [section]: updated };
    });
  };

  const addArrayItem = (
    section: 'diagnosis' | 'procedures' | 'allergies' | 'diet' | 'activityRestrictions' | 'woundCare' | 'warningSigns' | 'emergencyInstructions' | 'additionalNotes'
  ) => {
    onDirtyChange(true);
    setData((prev) => ({
      ...prev,
      [section]: [
        ...prev[section],
        { value: '', status: 'MISSING' as FieldStatus },
      ],
    }));
  };

  const removeArrayItem = (
    section: 'diagnosis' | 'procedures' | 'allergies' | 'diet' | 'activityRestrictions' | 'woundCare' | 'warningSigns' | 'emergencyInstructions' | 'additionalNotes',
    index: number
  ) => {
    onDirtyChange(true);
    setData((prev) => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== index),
    }));
  };

  // Medication Updaters
  const updateMedication = (index: number, field: keyof MedicationItem, value: string) => {
    setData((prev) => {
      const meds = [...prev.medications];
      const target = { ...meds[index], [field]: value };

      if (field === 'dosage') {
        target.dosageStatus = value.trim() ? 'FOUND' : 'MISSING';
      } else if (field === 'frequency') {
        target.frequencyStatus = value.trim() ? 'FOUND' : 'MISSING';
      } else if (field === 'instructions') {
        target.instructionsStatus = value.trim() ? 'FOUND' : 'MISSING';
      } else if (field === 'name') {
        target.overallStatus = value.trim() ? 'FOUND' : 'MISSING';
      } else if (field === 'duration') {
        target.durationStatus = value.trim() ? 'FOUND' : 'MISSING';
      }

      meds[index] = target;
      return { ...prev, medications: meds };
    });
  };

  const addMedication = () => {
    onDirtyChange(true);
    const newMed: MedicationItem = {
      id: `med-custom-${Date.now()}`,
      name: '',
      dosage: '',
      dosageStatus: 'MISSING',
      frequency: '',
      frequencyStatus: 'MISSING',
      duration: '',
      durationStatus: 'MISSING',
      instructions: '',
      instructionsStatus: 'MISSING',
      overallStatus: 'MISSING',
    };
    setData((prev) => ({
      ...prev,
      medications: [...prev.medications, newMed],
    }));
  };

  const removeMedication = (index: number) => {
    onDirtyChange(true);
    setData((prev) => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
  };

  // Follow-up Updaters
  const updateFollowUp = (index: number, field: 'provider' | 'date' | 'time' | 'location' | 'instructions', value: string) => {
    setData((prev) => {
      const items = [...prev.followUp];
      items[index] = editFollowUp(items[index], field, value);
      return { ...prev, followUp: items };
    });
  };

  const addFollowUp = () => {
    onDirtyChange(true);
    const newItem = createBlankFollowUp(`fu-custom-${Date.now()}`);
    setData((prev) => ({
      ...prev,
      followUp: [...prev.followUp, newItem],
    }));
  };

  const removeFollowUp = (index: number) => {
    onDirtyChange(true);
    setData((prev) => ({
      ...prev,
      followUp: prev.followUp.filter((_, i) => i !== index),
    }));
  };

  const handleConfirmLock = () => {
    const hasUnclear = (value: unknown): boolean => !!value && typeof value === 'object' && Object.entries(value).some(([key, item]) => (key.toLowerCase().endsWith('status') && item === 'UNCLEAR') || hasUnclear(item));
    if (hasUnclear(data)) { alert('Correct or remove every UNCLEAR field before confirming. Compare each field with the original source.'); return; }
    if (!data.patient.name.value.trim() || !data.patient.patientId.value.trim()) {
      alert('Patient Name and Patient ID are required before confirming authoritative dataset.');
      return;
    }

    const authoritative: AuthoritativeDischargeData = {
      ...data,
      isConfirmedAuthoritative: true,
      verifiedAt: new Date().toISOString(),
      verifiedBy: {
        name: clinicianName,
        role: 'Attending Clinician',
      },
    };

    onVerifyComplete(authoritative);
  };

  return (
    <div className="mx-auto max-w-5xl p-6" onChange={() => onDirtyChange(true)}>
      {/* Banner */}
      <div className="mb-6 rounded-[28px] bg-[#5A5A40]/10 border border-[#5A5A40]/20 p-6 text-[#3E4234] shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5A5A40] text-white shadow-xs">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif italic text-xl tracking-tight text-[#3E4234] flex items-center gap-2">
                <span>Step 2 — Clinical Verification & Completion</span>
                <span className="rounded-full bg-[#D9D1C5] px-2.5 py-0.5 text-[10px] font-bold text-[#5A5A40]">
                  HUMAN IN THE LOOP
                </span>
              </h3>
              <p className="text-xs text-[#665F54] font-medium mt-0.5">
                AI-extracted values must be thoroughly verified by a healthcare professional. Correct errors, add missing dosages or frequencies, and confirm accuracy.
              </p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-[#3E4234]">VERIFIER: {clinicianName}</div>
            <div className="text-[10px] text-[#665F54]">Authoritative Clinical Sign-Off</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <details className="rounded-2xl bg-white p-5 border border-slate-200">
          <summary className="cursor-pointer font-bold text-sm">Extracted source excerpts — compare with the original document</summary>
          <p className="mt-2 text-xs">These excerpts were captured during extraction. They do not verify later edits or replace review of the original source.</p>
          <dl className="mt-3 space-y-2 text-xs">
            {sourceExcerpts.map((item, index) => <div key={index}><dt className="font-bold">{item.label}</dt><dd className="whitespace-pre-wrap">{item.quote || 'No source excerpt captured'}</dd></div>)}
          </dl>
        </details>
        {/* Section 1: Patient Details */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-blue-600" /> Patient Identification
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Patient Name *</label>
                <StatusBadge status={data.patient.name.status} size="sm" />
              </div>
              <input aria-label="Full Patient Name"
                type="text"
                value={data.patient.name.value}
                onChange={(e) => updatePatientField('name', e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none"
                placeholder="Full Patient Name"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Patient ID *</label>
                <StatusBadge status={data.patient.patientId.status} size="sm" />
              </div>
              <input aria-label="e.g. PAT-88492"
                type="text"
                value={data.patient.patientId.value}
                onChange={(e) => updatePatientField('patientId', e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold text-slate-800 focus:border-blue-500 focus:outline-none"
                placeholder="e.g. PAT-88492"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Age</label>
                <StatusBadge status={data.patient.age.status} size="sm" />
              </div>
              <input aria-label="Age in years"
                type="text"
                value={data.patient.age.value}
                onChange={(e) => updatePatientField('age', e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                placeholder="Age in years"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Gender</label>
                <StatusBadge status={data.patient.gender.status} size="sm" />
              </div>
              <input aria-label="Male / Female / Other"
                type="text"
                value={data.patient.gender.value}
                onChange={(e) => updatePatientField('gender', e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                placeholder="Male / Female / Other"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Diagnoses & Procedures */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" /> Diagnoses
              </h4>
              <button
                type="button"
                onClick={() => addArrayItem('diagnosis')}
                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {data.diagnosis.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input aria-label="Clinical Diagnosis"
                    type="text"
                    value={item.value}
                    onChange={(e) => updateArrayItem('diagnosis', idx, e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 p-2 text-xs font-medium text-slate-800"
                    placeholder="Clinical Diagnosis"
                  />
                  <StatusBadge status={item.status} size="sm" />
                  <button aria-label="Remove diagnosis"
                    type="button"
                    onClick={() => removeArrayItem('diagnosis', idx)}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-blue-600" /> Procedures
              </h4>
              <button
                type="button"
                onClick={() => addArrayItem('procedures')}
                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {data.procedures.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input aria-label="Surgical / Medical Procedure"
                    type="text"
                    value={item.value}
                    onChange={(e) => updateArrayItem('procedures', idx, e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 p-2 text-xs font-medium text-slate-800"
                    placeholder="Surgical / Medical Procedure"
                  />
                  <StatusBadge status={item.status} size="sm" />
                  <button aria-label="Remove procedures"
                    type="button"
                    onClick={() => removeArrayItem('procedures', idx)}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 3: Verified Medications Table */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Pill className="h-4 w-4 text-blue-600" /> Verified Medication Schedule
              </h4>
              <p className="text-[11px] text-slate-500">
                Carefully check drug names, dosage numbers, frequencies, and durations.
              </p>
            </div>
            <button
              type="button"
              onClick={addMedication}
              className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Medication
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-2.5">Medication Name *</th>
                  <th className="p-2.5">Dosage *</th>
                  <th className="p-2.5">Frequency *</th>
                  <th className="p-2.5">Duration</th>
                  <th className="p-2.5">Instructions</th>
                  <th className="p-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.medications.map((med, idx) => (
                  <tr key={med.id || idx} className="hover:bg-slate-50/80">
                    <td className="p-2">
                      <input aria-label="Drug Name"
                        type="text"
                        value={med.name}
                        onChange={(e) => updateMedication(idx, 'name', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-1.5 text-xs font-bold text-slate-900"
                        placeholder="Drug Name"
                      />
                      <StatusBadge status={med.overallStatus} size="sm" />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <input aria-label="e.g. 500 mg"
                          type="text"
                          value={med.dosage}
                          onChange={(e) => updateMedication(idx, 'dosage', e.target.value)}
                          className="w-full rounded-lg border border-slate-300 p-1.5 text-xs font-medium text-slate-800"
                          placeholder="e.g. 500 mg"
                        />
                        <StatusBadge status={med.dosageStatus} size="sm" />
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <input aria-label="e.g. Once daily after breakfast"
                          type="text"
                          value={med.frequency}
                          onChange={(e) => updateMedication(idx, 'frequency', e.target.value)}
                          className="w-full rounded-lg border border-slate-300 p-1.5 text-xs font-medium text-slate-800"
                          placeholder="e.g. Once daily after breakfast"
                        />
                        <StatusBadge status={med.frequencyStatus} size="sm" />
                      </div>
                    </td>
                    <td className="p-2">
                      <input aria-label="e.g. 30 days"
                        type="text"
                        value={med.duration}
                        onChange={(e) => updateMedication(idx, 'duration', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-1.5 text-xs text-slate-800"
                        placeholder="e.g. 30 days"
                      />
                      <StatusBadge status={med.durationStatus} size="sm" />
                    </td>
                    <td className="p-2">
                      <input aria-label="Medication instructions"
                        type="text"
                        value={med.instructions}
                        onChange={(e) => updateMedication(idx, 'instructions', e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-1.5 text-xs text-slate-800"
                        placeholder="Special rules"
                      />
                      <StatusBadge status={med.instructionsStatus} size="sm" />
                    </td>
                    <td className="p-2 text-center">
                      <button aria-label="Remove Medication"
                        type="button"
                        onClick={() => removeMedication(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Allergies & Diet */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" /> Allergies
              </h4>
              <button
                type="button"
                onClick={() => addArrayItem('allergies')}
                className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {data.allergies.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input aria-label="Drug or Food Allergy"
                    type="text"
                    value={item.value}
                    onChange={(e) => updateArrayItem('allergies', idx, e.target.value)}
                    className="flex-1 rounded-xl border border-rose-200 bg-rose-50/50 p-2 text-xs font-bold text-rose-900"
                    placeholder="Drug or Food Allergy"
                  />
                  <StatusBadge status={item.status} size="sm" />
                  <button aria-label="Remove allergies"
                    type="button"
                    onClick={() => removeArrayItem('allergies', idx)}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                Dietary Instructions
              </h4>
              <button
                type="button"
                onClick={() => addArrayItem('diet')}
                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {data.diet.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input aria-label="Dietary restriction / rules"
                    type="text"
                    value={item.value}
                    onChange={(e) => updateArrayItem('diet', idx, e.target.value)}
                    className="flex-1 rounded-xl border border-slate-300 p-2 text-xs font-medium text-slate-800"
                    placeholder="Dietary restriction / rules"
                  />
                  <StatusBadge status={item.status} size="sm" />
                  <button aria-label="Remove diet"
                    type="button"
                    onClick={() => removeArrayItem('diet', idx)}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {(['activityRestrictions', 'woundCare', 'warningSigns', 'emergencyInstructions', 'additionalNotes'] as const).map(section => (
            <section key={section} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h4 className="mb-3 text-sm font-bold">{{ activityRestrictions: 'Activity restrictions', woundCare: 'Wound care', warningSigns: 'Warning signs', emergencyInstructions: 'Emergency instructions', additionalNotes: 'Additional notes' }[section]}</h4>
              {data[section].map((item, idx) => <div key={idx} className="mb-2 flex items-center gap-2">
                <input aria-label={section + ' ' + (idx + 1)} value={item.value} onChange={event => updateArrayItem(section, idx, event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300 p-2 text-xs" />
                <StatusBadge status={item.status} size="sm" />
                <button type="button" aria-label={'Remove ' + section + ' ' + (idx + 1)} onClick={() => removeArrayItem(section, idx)}><Trash2 className="h-4 w-4" /></button>
              </div>)}
              <button type="button" onClick={() => addArrayItem(section)} className="text-sm font-bold text-blue-700">Add {section.replace(/([A-Z])/g, ' $1').toLowerCase()}</button>
            </section>
          ))}
        </div>

        {/* Section 5: Follow-Up Appointments */}
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" /> Follow-Up Appointments
            </h4>
            <button
              type="button"
              onClick={addFollowUp}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Appointment
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {data.followUp.map((fu, idx) => (
              <div key={fu.id || idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <div><input aria-label="Doctor / Clinic Name"
                  type="text"
                  value={fu.provider}
                  onChange={(e) => updateFollowUp(idx, 'provider', e.target.value)}
                  className="rounded-lg border border-slate-300 p-1.5 text-xs font-bold text-slate-800"
                  placeholder="Doctor / Clinic Name"
                /><StatusBadge status={fu.providerStatus || fu.status} size="sm" /></div>
                <div><input aria-label="date"
                  type="text"
                  placeholder="Date as stated in source"
                  value={fu.date}
                  onChange={(e) => updateFollowUp(idx, 'date', e.target.value)}
                  className="rounded-lg border border-slate-300 p-1.5 text-xs text-slate-800"
                /><StatusBadge status={fu.dateStatus || fu.status} size="sm" /></div>
                <div><input aria-label="Time (e.g. 10:30 AM)"
                  type="text"
                  value={fu.time}
                  onChange={(e) => updateFollowUp(idx, 'time', e.target.value)}
                  className="rounded-lg border border-slate-300 p-1.5 text-xs text-slate-800"
                  placeholder="Time (e.g. 10:30 AM)"
                /><StatusBadge status={fu.timeStatus || fu.status} size="sm" /></div>
                <div><input aria-label="Clinic Location / Room"
                  type="text"
                  value={fu.location}
                  onChange={(e) => updateFollowUp(idx, 'location', e.target.value)}
                  className="rounded-lg border border-slate-300 p-1.5 text-xs text-slate-800"
                  placeholder="Clinic Location / Room"
                /><StatusBadge status={fu.locationStatus || fu.status} size="sm" /></div>
                <div className="flex items-center gap-2">
                  <input aria-label="Instructions"
                    type="text"
                    value={fu.instructions}
                    onChange={(e) => updateFollowUp(idx, 'instructions', e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 p-1.5 text-xs text-slate-800"
                    placeholder="Instructions"
                  />
                  <StatusBadge status={fu.instructionsStatus || fu.status} size="sm" />
                  <button aria-label="Remove Follow Up"
                    type="button"
                    onClick={() => removeFollowUp(idx)}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lock Action Button */}
        <div className="mt-2 flex flex-col items-center justify-between rounded-[28px] bg-[#3E4234] text-white p-6 shadow-xs border border-[#2A2D23] sm:flex-row gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5A5A40] text-white shadow-xs">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h4 className="font-serif italic text-base text-white tracking-wide">
                Confirm Verified Authoritative Patient Data
              </h4>
              <p className="text-xs text-[#D9D1C5] mt-0.5">
                Confirm only information checked against the original source. The verified snapshot is saved when you generate and save the report.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleConfirmLock}
            className="flex items-center gap-2 rounded-2xl bg-[#5A5A40] px-6 py-3 text-xs font-bold text-white hover:bg-[#4A4A34] active:scale-95 transition-all cursor-pointer whitespace-nowrap uppercase tracking-wider"
          >
            <Lock className="h-4 w-4" />
            <span>CONFIRM VERIFIED DATA</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
