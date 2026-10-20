
export type FieldStatus = 'FOUND' | 'MISSING' | 'UNCLEAR';

export interface ExtractedField {
  value: string;
  status: FieldStatus;
  evidence: string;
}

export interface ExtractedMedication {
  name: ExtractedField;
  dosage: ExtractedField;
  frequency: ExtractedField;
  duration: ExtractedField;
  instructions: ExtractedField;
}

export interface ExtractedFollowUp {
  provider: ExtractedField;
  date: ExtractedField;
  time: ExtractedField;
  location: ExtractedField;
  instructions: ExtractedField;
}

export interface CanonicalDischargeExtraction {
  patient: {
    name: ExtractedField;
    patientId: ExtractedField;
    age: ExtractedField;
    gender: ExtractedField;
  };
  diagnoses: ExtractedField[];
  procedures: ExtractedField[];
  medications: ExtractedMedication[];
  allergies: ExtractedField[];
  dietaryInstructions: ExtractedField[];
  woundCare: ExtractedField[];
  activityRestrictions: ExtractedField[];
  followUpAppointments: ExtractedFollowUp[];
  warningSigns: ExtractedField[];
  emergencyInstructions: ExtractedField[];
  additionalNotes?: ExtractedField[];
}

export function mapCanonicalToStructured(
  canonical: CanonicalDischargeExtraction,
  metadata?: any
): any {
  return {
    patient: {
      name: { value: canonical.patient.name.value, status: canonical.patient.name.status, note: canonical.patient.name.evidence },
      patientId: { value: canonical.patient.patientId.value, status: canonical.patient.patientId.status, note: canonical.patient.patientId.evidence },
      age: { value: canonical.patient.age.value, status: canonical.patient.age.status, note: canonical.patient.age.evidence },
      gender: { value: canonical.patient.gender.value, status: canonical.patient.gender.status, note: canonical.patient.gender.evidence },
    },
    diagnosis: canonical.diagnoses.map((d) => ({ value: d.value, status: d.status, note: d.evidence })),
    procedures: canonical.procedures.map((p) => ({ value: p.value, status: p.status, note: p.evidence })),
    medications: canonical.medications.map((m, i) => ({
      id: `med-${i + 1}`,
      name: m.name.value || 'Unspecified Medication',
      dosage: m.dosage.value,
      dosageStatus: m.dosage.status,
      frequency: m.frequency.value,
      frequencyStatus: m.frequency.status,
      duration: m.duration.value,
      durationStatus: m.duration.status,
      instructions: m.instructions.value,
      instructionsStatus: m.instructions.status || 'FOUND',
      overallStatus: m.name.status === 'FOUND' ? 'FOUND' : m.name.status,
      sourceSection: [...new Set(Object.values(m).map(field => field.evidence).filter(Boolean))].join('\n'),
    })),
    allergies: canonical.allergies.map((a) => ({ value: a.value, status: a.status, note: a.evidence })),
    diet: canonical.dietaryInstructions.map((d) => ({ value: d.value, status: d.status, note: d.evidence })),
    activityRestrictions: canonical.activityRestrictions.map((a) => ({ value: a.value, status: a.status, note: a.evidence })),
    woundCare: canonical.woundCare.map((w) => ({ value: w.value, status: w.status, note: w.evidence })),
    followUp: canonical.followUpAppointments.map((f, i) => ({
      id: `fu-${i + 1}`,
      provider: f.provider.value,
      date: f.date.value,
      time: f.time.value,
      location: f.location.value,
      instructions: f.instructions.value,
      providerStatus: f.provider.status,
      dateStatus: f.date.status,
      timeStatus: f.time.status,
      locationStatus: f.location.status,
      instructionsStatus: f.instructions.status,
      sourceSection: [...new Set(Object.values(f).map(field => field.evidence).filter(Boolean))].join('\n'),
      status: Object.values(f).some(field => field.status === 'UNCLEAR') ? 'UNCLEAR' :
        f.provider.status === 'FOUND' ||
        f.date.status === 'FOUND' ||
        f.instructions.status === 'FOUND' ||
        f.location.status === 'FOUND' ||
        f.time.status === 'FOUND'
          ? 'FOUND'
          : 'MISSING',
    })),
    warningSigns: canonical.warningSigns.map((w) => ({ value: w.value, status: w.status, note: w.evidence })),
    emergencyInstructions: canonical.emergencyInstructions.map((e) => ({ value: e.value, status: e.status, note: e.evidence })),
    additionalNotes: (canonical.additionalNotes || []).map(note => ({ value: note.value, status: note.status, note: note.evidence })),
    extractionMetadata: metadata,
  };
}

