import { MODEL_SHA256, sha256File } from '../scripts/download-model';
import path from 'path';
import fs from 'fs';
import { getLlama, LlamaModel, LlamaChatSession } from 'node-llama-cpp';
import { CanonicalDischargeExtraction, ExtractedField } from './clinicalExtractionService.js';

export const LOCAL_EXTRACTION_PROMPT_VERSION = 'local-extraction-v2-additional-notes';

export interface LocalExtractionBenchmarkMetrics {
  device: string;
  vramUsedMb: number;
  systemRamUsedMb: number;
  loadTimeMs: number;
  inferenceTimeMs: number;
  totalTokens: number;
  tokensPerSec: number;
  geminiApiCalls: 0;
}

export interface LocalClinicalExtractionResult {
  data: CanonicalDischargeExtraction;
  metrics: LocalExtractionBenchmarkMetrics;
}

export interface QwenStatus {
  engine: string;
  model: string;
  status: string;
  device: string;
  geminiApiCalls: 0;
  modelPath: string;
  modelLoaded: boolean;
  online: boolean;
  message: string;
  loadTimeMs: number;
}

const MODEL_PATH = path.join(
  process.cwd(),
  'models',
  'qwen2.5-1.5b',
  'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'
);

let cachedLlama: any = null;
let cachedModel: LlamaModel | null = null;
let isCudaAvailable = false;
let backend = 'CPU';
let initialization: Promise<{ llama: any; model: LlamaModel }> | undefined;
let inferenceActive = false;
let modelLoadTimeMs = 0;

export function getOrInitQwenModel(): Promise<{ llama: any; model: LlamaModel }> {
  if (!initialization) initialization = initializeModel().catch(error => { initialization = undefined; throw error; });
  return initialization;
}
async function initializeModel(): Promise<{ llama: any; model: LlamaModel }> {
  if (cachedModel) {
    return { llama: cachedLlama, model: cachedModel };
  }

  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error(
      'Local model file not found. Run npm run download-model.'
    );
  }

  if (await sha256File(MODEL_PATH) !== MODEL_SHA256) throw new Error('Local model checksum mismatch. Run npm run download-model.');
  const startLoad = Date.now();
  console.log('[QwenEngine] Initializing pinned local Qwen model...');

  try {
    cachedLlama = await getLlama();
    const gpuDevice = cachedLlama.gpu;
    isCudaAvailable = !!gpuDevice && gpuDevice !== 'cpu';
    backend = isCudaAvailable ? String(gpuDevice).toUpperCase() : 'CPU';

    console.log(`[QwenEngine] Compute device: ${backend} (gpu=${gpuDevice})`);

    cachedModel = await cachedLlama.loadModel({
      modelPath: MODEL_PATH,
      gpuLayers: isCudaAvailable ? 28 : 0,
    });

    modelLoadTimeMs = Date.now() - startLoad;
    console.log(`[QwenEngine] Model weights loaded in ${modelLoadTimeMs} ms.`);
    return { llama: cachedLlama, model: cachedModel! };
  } catch (err) {
    console.warn('[QwenEngine] GPU initialization failed; retrying in CPU mode.');
    cachedLlama = await getLlama({ gpu: false });
    cachedModel = await cachedLlama.loadModel({
      modelPath: MODEL_PATH,
      gpuLayers: 0,
    });
    isCudaAvailable = false;
    backend = 'CPU';
    modelLoadTimeMs = Date.now() - startLoad;
    console.log(`[QwenEngine] CPU model loaded in ${modelLoadTimeMs} ms.`);
    return { llama: cachedLlama, model: cachedModel! };
  }
}

export function getQwenStatus(): QwenStatus {
  return {
    engine: 'qwen2.5-1.5b-local',
    model: 'Qwen2.5-1.5B-Instruct-Q4_K_M',
    status: !fs.existsSync(MODEL_PATH) ? 'MISSING_MODEL' : cachedModel ? 'READY' : 'NOT_LOADED',
    online: fs.existsSync(MODEL_PATH),
    message: cachedModel ? 'Local model loaded' : 'Local model not loaded',
    device: cachedModel ? backend : 'Not initialized',
    geminiApiCalls: 0,
    modelPath: path.relative(process.cwd(), MODEL_PATH),
    modelLoaded: cachedModel !== null,
    loadTimeMs: modelLoadTimeMs,
  };
}

const LOCAL_EXTRACTION_SYSTEM_PROMPT = `You are an expert clinical medical extraction system.
Analyze the discharge text and return ONLY a valid, strict JSON object.

JSON SCHEMA:
{
  "patient": {
    "name": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
    "patientId": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
    "age": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
    "gender": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" }
  },
  "diagnoses": [ { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" } ],
  "procedures": [ { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" } ],
  "medications": [
    {
      "name": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
      "dosage": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
      "frequency": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
      "duration": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
      "instructions": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" }
    }
  ],
  "allergies": [ { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" } ],
  "dietaryInstructions": [ { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" } ],
  "woundCare": [ { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" } ],
  "activityRestrictions": [ { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" } ],
  "followUpAppointments": [
    {
      "provider": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
      "date": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
      "time": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
      "location": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" },
      "instructions": { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" }
    }
  ],
  "warningSigns": [ { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" } ],
  "emergencyInstructions": [ { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" } ],
  "additionalNotes": [ { "value": "", "status": "FOUND|MISSING|UNCLEAR", "evidence": "" } ]
}

CRITICAL RULES:

PATIENT IDENTIFICATION:
1. The patient is the person RECEIVING care who is being discharged home.
2. Doctors, physicians, surgeons, attendings, and nurses are CLINICIANS — never the patient.
3. Use the semantic context of the full document to determine who is the patient. The patient's name usually appears next to "Patient:", "Patient Name:", "Name:", or equivalent demographic headers. Physician names appear near "Attending:", "Surgeon:", "Physician:", "Dr.", "MD", or in follow-up sections.
4. If both have similar names, use the document's role labels. Never guess.

FOLLOW-UP APPOINTMENTS — STRUCTURED SUB-FIELDS:
Each follow-up appointment has five independent sub-fields. Extract each separately:
- provider: The doctor, surgeon, physician, specialist, clinic name, or department the patient must follow up with.
  Examples: "Dr. Elena Morris", "Cardiology Clinic", "Surgical Outpatient Department", "Dr. James Lee, Orthopedics"
  DO NOT put provider names into instructions.
- date: An EXPLICIT calendar date only (e.g. "September 21 2026", "09/21/2026", "2026-08-25").
  "in two weeks", "10–14 days post-op", "next month" are NOT dates — set value: "", status: "MISSING".
- time: An EXPLICIT time of day only (e.g. "10:30 AM", "14:00", "2:00 PM"). If absent, set value: "", status: "MISSING".
- location: The physical location, clinic name, hospital department, or room.
  Examples: "Building B Room 304", "Cardiology Outpatient Clinic", "Riverside Cardiology"
- instructions: Actual follow-up action instructions, scheduling directions, patient preparation steps, OR relative timing when no calendar date exists (e.g. "in two weeks", "in 10-14 days").
  DO NOT repeat doctor or clinic names in instructions when they belong in provider or location.

MEDICATIONS:
5. Only create a medication entry when a valid medication name is present.
6. Extract name, dosage, frequency, duration, and instructions independently per medication.
7. Missing frequency or duration must have value "" and status "MISSING". Do NOT infer "once daily" or any frequency.
8. Copy a maximum-dose clause only when it appears in the supplied document, into the associated medication instructions. Never copy examples from these rules into extracted data.
9. A dose restriction without an explicitly associated medication must not create a medication entry.

PROCEDURES:
10. Extract ACTUAL clinical procedures performed during hospitalization (e.g., "Laparoscopic Cholecystectomy", "Percutaneous Coronary Intervention").
11. Do NOT extract post-discharge care instructions (e.g. "Shower daily", "Pat dry", "Clean incision", "Light walking") as procedures.

MISSING / UNCLEAR:
12. Prefer MISSING over guessing. Prefer UNCLEAR over inventing.
13. Never infer clinical information from medical knowledge. Only extract what the document states.
14. Return ONLY valid raw JSON text. No markdown backticks, no markdown text, no explanation.`;

export async function extractClinicalDataLocal(
  normalizedText: string
): Promise<LocalClinicalExtractionResult> {
  if (inferenceActive) throw new Error('Local extraction is busy. Retry later.');
  if (normalizedText.length > 12_000) throw new Error('Clinical extraction supports at most 12,000 characters. Split this document.');
  inferenceActive = true;
  try { return await runExtraction(normalizedText); } finally { inferenceActive = false; }
}
async function runExtraction(normalizedText: string): Promise<LocalClinicalExtractionResult> {
  const { model } = await getOrInitQwenModel();

  const userPrompt = 'DISCHARGE DOCUMENT CONTENT:\n' + normalizedText + '\n\nReturn ONLY the JSON extraction object, no other text:';
  // shortcut: reserve 256 framing tokens for the pinned Qwen template, recalculate when changing the model.
  if (model.tokenize(LOCAL_EXTRACTION_SYSTEM_PROMPT + userPrompt).length + 2048 + 256 > 8192) throw new RangeError('Document exceeds the model token budget. Split the source document.');
  const context = await model.createContext({ contextSize: 8192 });

  const startInference = Date.now();
  const memoryBefore = process.memoryUsage();
  let responseText = '';

  try {
    const sequence = context.getSequence();
    const session = new LlamaChatSession({
      contextSequence: sequence,
      systemPrompt: LOCAL_EXTRACTION_SYSTEM_PROMPT,
      autoDisposeSequence: true,
    });


    responseText = await session.prompt(userPrompt, {
      temperature: 0.05,
      maxTokens: 2048,
      signal: AbortSignal.timeout(120_000),
    });
  } finally {
    await context.dispose();
  }

  const inferenceTimeMs = Math.max(1, Date.now() - startInference);
  const memoryAfter = process.memoryUsage();

  console.log(`[LOCAL EXTRACTION] engine=qwen2.5-1.5b-local device=${backend} inferenceMs=${inferenceTimeMs} geminiApiCalls=0`);


  const cleanedJson = cleanJsonText(responseText);
  let parsed: any = {};
  try {
    parsed = JSON.parse(cleanedJson);
  } catch (err) {
    console.warn('[QwenEngine] JSON parse failed, attempting repair...');
    parsed = repairAndParseJson(cleanedJson);
  }

  if (!parsed || !parsed.patient || typeof parsed.patient !== 'object') throw new Error('Model returned invalid extraction data. Retry with a clearer document.');
  const normalizedCanonical = normalizeCanonicalData(parsed);

  const approxTokens = Math.max(1, Math.ceil(responseText.length / 3));
  const tokensPerSec = Math.round((approxTokens / (inferenceTimeMs / 1000)) * 10) / 10;
  const systemRamUsedMb = Math.round(
    (memoryAfter.heapUsed - memoryBefore.heapUsed) / (1024 * 1024)
  );

  const metrics: LocalExtractionBenchmarkMetrics = {
    device: backend,
    vramUsedMb: Math.round((await cachedLlama.getVramState()).used / (1024 * 1024)),
    systemRamUsedMb: Math.max(0, systemRamUsedMb),
    loadTimeMs: modelLoadTimeMs,
    inferenceTimeMs,
    totalTokens: approxTokens,
    tokensPerSec,
    geminiApiCalls: 0,
  };

  return {
    data: normalizedCanonical,
    metrics,
  };
}

function cleanJsonText(input: string): string {
  let cleaned = input.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace > 0) cleaned = cleaned.substring(firstBrace);
  return cleaned.trim();
}

function repairAndParseJson(text: string): any {
  const start = text.indexOf('{');
  if (start === -1) return {};
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return {};
  try { return JSON.parse(text.substring(start, end + 1)); } catch { return {}; }
}

function cleanFollowUpInstructions(
  providerVal: string,
  locationVal: string,
  dateVal: string,
  instructionsField: ExtractedField
): ExtractedField {
  if (!instructionsField.value) return instructionsField;

  let cleaned = instructionsField.value;

  const escapeRegex = (s: string) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

  if (providerVal && cleaned.toLowerCase().includes(providerVal.toLowerCase())) {
    const reg = new RegExp(`(follow\\s*up\\s*with|see|review\\s*with)?\\s*${escapeRegex(providerVal)}\\s*(at|in)?\\s*`, 'gi');
    cleaned = cleaned.replace(reg, '');
    cleaned = cleaned.replace(new RegExp(escapeRegex(providerVal), 'gi'), '').trim();
  }

  if (locationVal && cleaned.toLowerCase().includes(locationVal.toLowerCase())) {
    const reg = new RegExp(`(at|in|at the)?\\s*${escapeRegex(locationVal)}\\s*`, 'gi');
    cleaned = cleaned.replace(reg, '');
    cleaned = cleaned.replace(new RegExp(escapeRegex(locationVal), 'gi'), '').trim();
  }

  if (dateVal && cleaned.toLowerCase().includes(dateVal.toLowerCase())) {
    cleaned = cleaned.replace(new RegExp(`(on|by|date:)?\\s*${escapeRegex(dateVal)}`, 'gi'), '').trim();
  }

  // Clean leading prepositions & verbs while preserving relative timing phrases like "in 2 weeks"
  cleaned = cleaned
    .replace(/^(follow up with|follow-up with|see|review with|contact|appointment with|at|on|for)\s+/i, '')
    .trim();

  // Strip orphan prepositions & trailing punctuation
  cleaned = cleaned.replace(/^(in|at|on|for|\.)+$/i, '').trim();
  cleaned = cleaned.replace(/^[\s,\-.:]+|[\s,\-.:]+$/g, '').trim();

  if (
    cleaned.toLowerCase() === providerVal.toLowerCase() ||
    cleaned.toLowerCase() === locationVal.toLowerCase()
  ) {
    cleaned = '';
  }

  return {
    ...instructionsField,
    value: cleaned,
    status: cleaned ? instructionsField.status : 'MISSING',
  };
}

export function normalizeCanonicalData(data: any): CanonicalDischargeExtraction {
  const normField = (f: any): ExtractedField => {
    if (typeof f !== 'object' || f === null) {
      const v = typeof f === 'string' ? f.trim() : String(f ?? '').trim();
      return { value: v, status: v ? 'UNCLEAR' : 'MISSING', evidence: v };
    }
    const value = typeof f.value === 'string' ? f.value.trim() : String(f.value ?? '').trim();
    const status = ['FOUND', 'MISSING', 'UNCLEAR'].includes(f.status) ? f.status : (value ? 'UNCLEAR' : 'MISSING');
    const evidence = typeof f.evidence === 'string' ? f.evidence.trim() : value;
    return { value, status, evidence };
  };

  const normArrayField = (arr: any): ExtractedField[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map(normField).filter((f) => f.value.length > 0);
  };

  const emptyField: ExtractedField = { value: '', status: 'MISSING', evidence: '' };

  const normFollowUp = (item: any): any => {
    if (typeof item === 'string') {
      const v = item.trim();
      const field: ExtractedField = v ? { value: v, status: 'UNCLEAR', evidence: v } : emptyField;
      return {
        provider: emptyField,
        date: emptyField,
        time: emptyField,
        location: emptyField,
        instructions: field,
      };
    }

    if (typeof item !== 'object' || item === null) {
      return {
        provider: emptyField,
        date: emptyField,
        time: emptyField,
        location: emptyField,
        instructions: emptyField,
      };
    }

    const hasStructuredKeys =
      'provider' in item || 'date' in item || 'time' in item || 'location' in item || 'instructions' in item;

    if (hasStructuredKeys) {
      let providerField = normField(item.provider ?? emptyField);
      let dateField = normField(item.date ?? emptyField);
      let timeField = normField(item.time ?? emptyField);
      let locationField = normField(item.location ?? emptyField);
      let rawInstructionsField = normField(item.instructions ?? emptyField);

      // Enforce date semantics: Relative timing (e.g. "2 weeks", "10-14 days") in dateField belongs to instructions, NOT date
      const isCalendarDate = /^\d{1,4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,4}$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(
        dateField.value
      );
      if (dateField.value && !isCalendarDate) {
        if (!rawInstructionsField.value) {
          rawInstructionsField = {
            value: dateField.value.startsWith('in ') ? dateField.value : `in ${dateField.value}`,
            status: dateField.status,
            evidence: dateField.evidence,
          };
        }
        dateField = emptyField;
      }

      // Clean instructions generically so provider/location info is not duplicated in instructions
      const cleanedInstructionsField = cleanFollowUpInstructions(
        providerField.value,
        locationField.value,
        dateField.value,
        rawInstructionsField
      );

      return {
        provider: providerField,
        date: dateField,
        time: timeField,
        location: locationField,
        instructions: cleanedInstructionsField,
      };
    }

    if ('value' in item) {
      const field = normField(item);
      return {
        provider: emptyField,
        date: emptyField,
        time: emptyField,
        location: emptyField,
        instructions: field,
      };
    }

    return {
      provider: emptyField,
      date: emptyField,
      time: emptyField,
      location: emptyField,
      instructions: emptyField,
    };
  };

  return {
    patient: {
      name: normField(data?.patient?.name),
      patientId: normField(data?.patient?.patientId),
      age: normField(data?.patient?.age),
      gender: normField(data?.patient?.gender),
    },
    diagnoses: normArrayField(data?.diagnoses),
    procedures: normArrayField(data?.procedures),
    medications: Array.isArray(data?.medications)
      ? data.medications
          .map((m: any) => ({
            name: normField(m?.name),
            dosage: normField(m?.dosage),
            frequency: normField(m?.frequency),
            duration: normField(m?.duration),
            instructions: normField(m?.instructions),
          }))
          .filter((m: any) => m.name.value.length > 0 && !isInvalidMedicationName(m.name.value))
      : [],
    allergies: normArrayField(data?.allergies),
    dietaryInstructions: normArrayField(data?.dietaryInstructions),
    woundCare: normArrayField(data?.woundCare),
    activityRestrictions: normArrayField(data?.activityRestrictions),
    followUpAppointments: Array.isArray(data?.followUpAppointments)
      ? data.followUpAppointments
          .map(normFollowUp)
          .filter((f: any) => Object.values(f).some((field: any) => field.value))
      : [],
    warningSigns: normArrayField(data?.warningSigns),
    emergencyInstructions: normArrayField(data?.emergencyInstructions),
    additionalNotes: normArrayField(data?.additionalNotes),
  };
}

function isInvalidMedicationName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('do not take') ||
    lower.includes('maximum dose') ||
    lower.includes('take more than') ||
    lower.startsWith('instructions') ||
    lower.startsWith('do not') ||
    lower.startsWith('avoid')
  );
}
