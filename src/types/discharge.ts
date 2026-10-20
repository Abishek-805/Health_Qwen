export type FieldStatus = 'FOUND' | 'MISSING' | 'UNCLEAR';

export interface FieldValue<T> {
  value: T;
  status: FieldStatus;
  sourcePage?: number;
  sourceSection?: string;
  confidence?: number;
  note?: string;
}

export interface MedicationItem {
  id: string;
  name: string;
  dosage: string;
  dosageStatus: FieldStatus;
  frequency: string;
  frequencyStatus: FieldStatus;
  duration: string;
  durationStatus: FieldStatus;
  instructions: string;
  instructionsStatus: FieldStatus;
  overallStatus: FieldStatus;
  sourceSection?: string;
}

export interface FollowUpItem {
  id: string;
  provider: string;
  date: string;
  time: string;
  location: string;
  instructions: string;
  status: FieldStatus;
  providerStatus?: FieldStatus;
  dateStatus?: FieldStatus;
  timeStatus?: FieldStatus;
  locationStatus?: FieldStatus;
  instructionsStatus?: FieldStatus;
  sourceSection?: string;
}

export interface PatientInfo {
  name: FieldValue<string>;
  patientId: FieldValue<string>;
  age: FieldValue<string>;
  gender: FieldValue<string>;
}

export interface StructuredDischargeInfo {
  patient: PatientInfo;
  diagnosis: Array<FieldValue<string>>;
  procedures: Array<FieldValue<string>>;
  medications: MedicationItem[];
  allergies: Array<FieldValue<string>>;
  diet: Array<FieldValue<string>>;
  activityRestrictions: Array<FieldValue<string>>;
  woundCare: Array<FieldValue<string>>;
  followUp: FollowUpItem[];
  warningSigns: Array<FieldValue<string>>;
  emergencyInstructions: Array<FieldValue<string>>;
  additionalNotes: Array<FieldValue<string>>;
  extractionMetadata?: {
    extractedAt: string;
    sourceFileType: 'pdf' | 'jpg' | 'png' | 'text';
    sourceFileName: string;
    totalFieldsExtracted: number;
    foundCount: number;
    missingCount: number;
    unclearCount: number;
  };
}

export interface AuthoritativeDischargeData extends StructuredDischargeInfo {
  verifiedAt: string;
  verifiedBy: {
    name: string;
    role: string;
    licenseNumber?: string;
  };
  isConfirmedAuthoritative: true;
}

export type SupportedLanguage = 'en' | 'hi' | 'ta';

export interface HospitalInfo {
  name: string;
  department: string;
  logoUrl?: string;
}

export interface GeneratedReportSections {
  summary: string;
  diagnosisAndProcedures: string;
  medicationInstructions: string;
  dietAndActivity: string;
  woundCareAndHygiene: string;
  followUpAppointments: string;
  warningSignsAndEmergency: string;
  additionalInstructions: string;
}

export type ReportSections = GeneratedReportSections;

export interface GeneratedReport {
  id: string;
  version: number;
  language: SupportedLanguage;
  patientName: string;
  patientId: string;
  title: string;
  sections: GeneratedReportSections;
  rawMarkdown: string;
  generatedAt: string;
  promptNotes?: string;
}

export type AuditLayer1Category =
  | 'PATIENT_INFORMATION'
  | 'DIAGNOSIS'
  | 'PROCEDURES'
  | 'MEDICATIONS'
  | 'ALLERGIES'
  | 'FOLLOW_UP'
  | 'OMISSIONS'
  | 'NUMERIC_VALUES'
  | 'DATES';

export type AuditLayer2Category =
  | 'DIET'
  | 'ACTIVITY_RESTRICTIONS'
  | 'WOUND_PROCEDURE_CARE'
  | 'WARNING_SIGNS'
  | 'EMERGENCY_INSTRUCTIONS'
  | 'UNSUPPORTED_CLAIMS'
  | 'CONTRADICTIONS'
  | 'MEDICAL_MEANING'
  | 'WORDING';

export type AuditCategory = AuditLayer1Category | AuditLayer2Category;

export type AuditSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AuditCategoryStatus = 'PASS' | 'REVIEW_REQUIRED' | 'CRITICAL_ISSUE' | 'NOT_APPLICABLE' | 'NOT_EVALUATED';

export type AuditRecommendation = 'READY_FOR_HUMAN_APPROVAL' | 'DO_NOT_APPROVE' | 'REVIEW_REQUIRED';

export interface AuditFinding {
  id: string;
  category: AuditCategory;
  categoryName: string;
  severity: AuditSeverity;
  status: AuditCategoryStatus;
  title: string;
  verifiedSourceText: string;
  generatedReportText: string;
  whyItMatters: string;
  sourcePage?: number;
  sourceSection?: string;
  isDeterministic: boolean;
}

export interface AuditResult {
  policyVersion?: string;
  cloudAuditStatus?: 'disabled' | 'completed' | 'unavailable';
  coverageNote?: string;
  auditId: string;
  reportVersion: number;
  auditedAt: string;
  overallStatus: AuditCategoryStatus;
  recommendation: AuditRecommendation;
  findings: AuditFinding[];
  categorySummaries: Record<AuditCategory, { status: AuditCategoryStatus; issueCount: number }>;
  summary: string;
  criticalCount?: number;
  warningCount?: number;
  passCount?: number;
  categoryStatus?: Record<string, AuditCategoryStatus>;
  approvalRecommendation?: AuditRecommendation;
}

export type HybridAuditResult = AuditResult;

export type ApprovalStatus =
  | 'DRAFT'
  | 'VERIFIED'
  | 'GENERATED'
  | 'AUDITED'
  | 'NEEDS_REVIEW'
  | 'APPROVED';

export interface DischargeDocument {
  id: string;
  patientId: string;
  patientName?: string;
  uploadedFileName?: string;
  uploadedFileType?: 'pdf' | 'jpg' | 'png' | 'text';
  uploadedAt?: string;
  rawExtractedData?: StructuredDischargeInfo;
  extractedInfo?: StructuredDischargeInfo;
  verifiedData?: AuthoritativeDischargeData;
  generatedReport?: GeneratedReport;
  reportHistory?: GeneratedReport[];
  currentVersion?: number;
  auditResult?: AuditResult;
  auditHistory?: AuditResult[];
  approvalStatus: ApprovalStatus;
  approvedBy?: {
    name: string;
    role: string;
    timestamp: string;
    signatureNote?: string;
  };
  hospitalInfo: HospitalInfo;
  createdAt: string;
  updatedAt: string;
}

export interface PatientRecord {
  patientId: string;
  name: string;
  age: string;
  gender: string;
  primaryDiagnosis: string;
  lastDischargeDate: string;
  documentCount: number;
  status: 'ACTIVE' | 'DISCHARGED' | 'PENDING_REVIEW';
}

export interface SystemSettings {
  hospitalName: string;
  department: string;
  logoUrl: string;
  defaultLanguage: SupportedLanguage;
  safetyConfiguration: {
    strictAuditMode: boolean;
    requireApprovalForLowSeverity: boolean;
    autoRegenerateOnCritical: boolean;
  };
  clinicianInfo: {
    name: string;
    role: string;
    licenseNumber: string;
  };
}
