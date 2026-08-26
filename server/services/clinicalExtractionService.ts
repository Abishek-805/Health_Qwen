import { GoogleGenAI, Type, Schema } from '@google/genai';

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
}

let genAIClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_BACKUP;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
}

const EXTRACTION_SYSTEM_PROMPT = `You are an authoritative clinical information extraction engine.

Extract factual clinical information ONLY from the supplied document.

STRICT CLINICAL EXTRACTION RULES:
1. Extract factual information ONLY present in the document.
2. DO NOT infer missing clinical information. Do not use medical knowledge to fill missing fields.
3. Every extracted value MUST be supported by direct text evidence in the document.
4. If a field is not present in the document, return value: "", status: "MISSING", evidence: "".
5. If information is ambiguous, return value: "", status: "UNCLEAR", evidence: "<relevant quote>".
6. PATIENT IDENTIFICATION: Distinguish the patient from attending physicians, doctors, surgeons, nurses, and clinicians based on full document context. Do not select a doctor or clinician as the patient simply because their name appears near patient info.
7. MEDICATIONS:
   - Create a medication entry ONLY when the document identifies an actual medication.
   - Associate medication attributes (dosage, frequency, duration, instructions) based on contextual meaning.
   - Maximum dose instructions (e.g. "Maximum 3000 mg per 24 hours") belong in instructions for the associated medication (e.g., Acetaminophen), NOT as separate medications ("Do not take more than", "3000 mg").
   - Standalone statements like "Do not take more than 3000 mg in 24 hours." by themselves MUST produce medications: [].
8. FREQUENCY & DURATION:
   - If source text does not explicitly specify a frequency (e.g., "Atorvastatin 40 mg"), set frequency: { value: "", status: "MISSING", evidence: "" }. DO NOT infer "once daily", "twice daily", or "at bedtime".
   - Same rule applies for duration.
9. PROCEDURES: Extract actual clinical procedures (e.g., "Laparoscopic Cholecystectomy", "Percutaneous Coronary Intervention"). Do NOT classify general wound care instructions or daily activities like "Shower", "Pat dry", "Clean incision", "Light walking" as procedures.

Return ONLY structured JSON adhering strictly to the schema.`;

const fieldSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.STRING },
    status: { type: Type.STRING, enum: ['FOUND', 'MISSING', 'UNCLEAR'] },
    evidence: { type: Type.STRING },
  },
  required: ['value', 'status', 'evidence'],
};

const medicationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: fieldSchema,
    dosage: fieldSchema,
    frequency: fieldSchema,
    duration: fieldSchema,
    instructions: fieldSchema,
  },
  required: ['name', 'dosage', 'frequency', 'duration', 'instructions'],
};

const followUpSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    provider: fieldSchema,
    date: fieldSchema,
    time: fieldSchema,
    location: fieldSchema,
    instructions: fieldSchema,
  },
  required: ['provider', 'date', 'time', 'location', 'instructions'],
};

const dischargeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    patient: {
      type: Type.OBJECT,
      properties: {
        name: fieldSchema,
        patientId: fieldSchema,
        age: fieldSchema,
        gender: fieldSchema,
      },
      required: ['name', 'patientId', 'age', 'gender'],
    },
    diagnoses: { type: Type.ARRAY, items: fieldSchema },
    procedures: { type: Type.ARRAY, items: fieldSchema },
    medications: { type: Type.ARRAY, items: medicationSchema },
    allergies: { type: Type.ARRAY, items: fieldSchema },
    dietaryInstructions: { type: Type.ARRAY, items: fieldSchema },
    woundCare: { type: Type.ARRAY, items: fieldSchema },
    activityRestrictions: { type: Type.ARRAY, items: fieldSchema },
    followUpAppointments: { type: Type.ARRAY, items: followUpSchema },
    warningSigns: { type: Type.ARRAY, items: fieldSchema },
    emergencyInstructions: { type: Type.ARRAY, items: fieldSchema },
  },
  required: [
    'patient',
    'diagnoses',
    'procedures',
    'medications',
    'allergies',
    'dietaryInstructions',
    'woundCare',
    'activityRestrictions',
    'followUpAppointments',
    'warningSigns',
    'emergencyInstructions',
  ],
};

function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned;
}

export interface ClinicalExtractionResult {
  data: CanonicalDischargeExtraction;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  geminiApiCalls: number;
}

export async function extractClinicalDataGemini(input: {
  fileBuffer?: Buffer;
  mimeType?: string;
  fileName?: string;
  textInput?: string;
}): Promise<ClinicalExtractionResult> {
  const ai = getGeminiClient();
  const model = getGeminiModelName();

  if (!ai) {
    throw new Error('Gemini API client is unavailable. Check GEMINI_API_KEY environment variable.');
  }

  const parts: any[] = [];

  if (input.fileBuffer && input.mimeType) {
    parts.push({
      inlineData: {
        mimeType: input.mimeType,
        data: input.fileBuffer.toString('base64'),
      },
    });
    parts.push({
      text: `${EXTRACTION_SYSTEM_PROMPT}\n\nExtract structured clinical discharge data from the attached document file (${input.fileName || 'discharge document'}).`,
    });
  } else if (input.textInput && input.textInput.trim().length > 0) {
    parts.push({
      text: `${EXTRACTION_SYSTEM_PROMPT}\n\nDISCHARGE DOCUMENT CONTENT:\n${input.textInput}`,
    });
  } else {
    throw new Error('No document file or clinical text provided for extraction.');
  }

  let response: any;
  try {
    response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: dischargeSchema,
        temperature: 0.1,
      },
    });
  } catch (err: any) {
    const backupKey = process.env.GEMINI_API_KEY_BACKUP;
    if (backupKey && backupKey !== process.env.GEMINI_API_KEY) {
      console.warn('Primary Gemini API key failed/rate limited. Retrying with GEMINI_API_KEY_BACKUP...');
      const backupAi = new GoogleGenAI({ apiKey: backupKey });
      response = await backupAi.models.generateContent({
        model,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: dischargeSchema,
          temperature: 0.1,
        },
      });
    } else {
      throw err;
    }
  }

  const rawText = response.text || '';
  if (!rawText) {
    throw new Error('Empty response received from Gemini clinical extraction API.');
  }

  const usage = response.usageMetadata;
  const tokenUsage = {
    inputTokens: usage?.promptTokenCount || 0,
    outputTokens: usage?.candidatesTokenCount || 0,
    totalTokens: usage?.totalTokenCount || 0,
  };

  const cleaned = cleanJsonText(rawText);
  const parsed = JSON.parse(cleaned) as CanonicalDischargeExtraction;
  const normalizedData = normalizeCanonicalExtraction(parsed);

  return {
    data: normalizedData,
    tokenUsage,
    geminiApiCalls: 1,
  };
}

function normalizeCanonicalExtraction(data: any): CanonicalDischargeExtraction {
  const normField = (f: any): ExtractedField => ({
    value: typeof f?.value === 'string' ? f.value.trim() : '',
    status: ['FOUND', 'MISSING', 'UNCLEAR'].includes(f?.status) ? f.status : f?.value ? 'FOUND' : 'MISSING',
    evidence: typeof f?.evidence === 'string' ? f.evidence.trim() : '',
  });

  return {
    patient: {
      name: normField(data?.patient?.name),
      patientId: normField(data?.patient?.patientId),
      age: normField(data?.patient?.age),
      gender: normField(data?.patient?.gender),
    },
    diagnoses: Array.isArray(data?.diagnoses) ? data.diagnoses.map(normField) : [],
    procedures: Array.isArray(data?.procedures) ? data.procedures.map(normField) : [],
    medications: Array.isArray(data?.medications)
      ? data.medications.map((m: any) => ({
          name: normField(m?.name),
          dosage: normField(m?.dosage),
          frequency: normField(m?.frequency),
          duration: normField(m?.duration),
          instructions: normField(m?.instructions),
        }))
      : [],
    allergies: Array.isArray(data?.allergies) ? data.allergies.map(normField) : [],
    dietaryInstructions: Array.isArray(data?.dietaryInstructions) ? data.dietaryInstructions.map(normField) : [],
    woundCare: Array.isArray(data?.woundCare) ? data.woundCare.map(normField) : [],
    activityRestrictions: Array.isArray(data?.activityRestrictions) ? data.activityRestrictions.map(normField) : [],
    followUpAppointments: Array.isArray(data?.followUpAppointments)
      ? data.followUpAppointments.map((f: any) => ({
          provider: normField(f?.provider),
          date: normField(f?.date),
          time: normField(f?.time),
          location: normField(f?.location),
          instructions: normField(f?.instructions),
        }))
      : [],
    warningSigns: Array.isArray(data?.warningSigns) ? data.warningSigns.map(normField) : [],
    emergencyInstructions: Array.isArray(data?.emergencyInstructions) ? data.emergencyInstructions.map(normField) : [],
  };
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
      sourceSection: m.instructions.evidence || m.name.evidence,
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
      status:
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
    additionalNotes: [],
    extractionMetadata: metadata,
  };
}

