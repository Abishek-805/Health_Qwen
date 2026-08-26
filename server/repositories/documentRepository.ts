import {
  DischargeDocument,
  PatientRecord,
  SystemSettings,
  AuthoritativeDischargeData,
  GeneratedReport,
  AuditResult,
  SupportedLanguage,
} from '../../src/types/discharge';

let documentsStore: DischargeDocument[] = [];
let patientsStore: PatientRecord[] = [];
let systemSettingsStore: SystemSettings = {
  hospitalName: 'Apollo General Hospital & Heart Center',
  department: 'Department of Cardiology & Cardiovascular Surgery',
  logoUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=150&auto=format&fit=crop&q=80',
  defaultLanguage: 'en',
  safetyConfiguration: {
    strictAuditMode: true,
    requireApprovalForLowSeverity: false,
    autoRegenerateOnCritical: false,
  },
  clinicianInfo: {
    name: 'Dr. Sarah Jenkins, MD',
    role: 'Attending Cardiologist',
    licenseNumber: 'MCI-883921',
  },
};

function seedInitialData() {
  patientsStore = [];
  documentsStore = [];
}

seedInitialData();

export const documentRepository = {
  getAllDocuments(): DischargeDocument[] {
    return documentsStore;
  },

  getDocumentById(id: string): DischargeDocument | undefined {
    return documentsStore.find((doc) => doc.id === id);
  },

  createDocument(doc: DischargeDocument): DischargeDocument {
    const existingIndex = documentsStore.findIndex((d) => d.id === doc.id);
    if (existingIndex >= 0) {
      documentsStore[existingIndex] = doc;
    } else {
      documentsStore.unshift(doc);
    }
    // Update patient record
    let patient = patientsStore.find((p) => p.patientId === doc.patientId);
    if (!patient) {
      patient = {
        patientId: doc.patientId,
        name: doc.patientName || 'New Patient',
        age: doc.rawExtractedData?.patient.age.value || 'N/A',
        gender: doc.rawExtractedData?.patient.gender.value || 'N/A',
        primaryDiagnosis: doc.rawExtractedData?.diagnosis[0]?.value || 'Under Evaluation',
        lastDischargeDate: new Date().toISOString().split('T')[0],
        documentCount: 1,
        status: 'PENDING_REVIEW',
      };
      patientsStore.unshift(patient);
    } else {
      patient.documentCount += 1;
      patient.lastDischargeDate = new Date().toISOString().split('T')[0];
    }
    return doc;
  },

  updateDocument(id: string, updates: Partial<DischargeDocument>): DischargeDocument | undefined {
    const idx = documentsStore.findIndex((doc) => doc.id === id);
    if (idx === -1) return undefined;

    const existing = documentsStore[idx];
    const updated = { ...existing, ...updates };
    documentsStore[idx] = updated;
    return updated;
  },

  getAllPatients(): PatientRecord[] {
    return patientsStore;
  },

  getPatientById(patientId: string): PatientRecord | undefined {
    return patientsStore.find((p) => p.patientId === patientId);
  },

  getSettings(): SystemSettings {
    return systemSettingsStore;
  },

  updateSettings(settings: Partial<SystemSettings>): SystemSettings {
    systemSettingsStore = { ...systemSettingsStore, ...settings };
    return systemSettingsStore;
  },
};
