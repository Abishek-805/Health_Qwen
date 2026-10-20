import { GoogleGenAI } from '@google/genai';
import {
  StructuredDischargeInfo,
  AuthoritativeDischargeData,
  GeneratedReport,
  SupportedLanguage,
  AuditFinding,
} from '../../src/types/discharge.js';
import {
  EXTRACTION_SYSTEM_PROMPT,
  GENERATION_SYSTEM_PROMPT,
  SEMANTIC_AUDIT_PROMPT,
  REGENERATION_SYSTEM_PROMPT,
} from './prompts.js';

let genAIClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  if (process.env.CLOUD_PROCESSING_ENABLED !== 'true' || !process.env.GEMINI_MODEL) return null;
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_BACKUP;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 15_000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL || '';
}

export async function checkGeminiStatus(): Promise<{
  online: boolean;
  model: string;
  message: string;
}> {
  if (process.env.CLOUD_PROCESSING_ENABLED !== 'true') return { online: false, model: '', message: 'Cloud processing is disabled.' };
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_BACKUP;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      online: false,
      model: getGeminiModelName(),
      message: 'GEMINI_API_KEY is not configured in server environment.',
    };
  }

  try {
    const ai = getGeminiClient();
    if (!ai) {
      return { online: false, model: getGeminiModelName(), message: 'Client initialization failed' };
    }
    const response = await ai.models.generateContent({
      model: getGeminiModelName(),
      contents: 'Respond with "OK" if online.',
    });
    if (response.text) {
      return {
        online: true,
        model: getGeminiModelName(),
        message: 'GEMINI AI ENGINE — ONLINE',
      };
    }
    return {
      online: false,
      model: getGeminiModelName(),
      message: 'Unexpected empty response from Gemini',
    };
  } catch (err: any) {
    return {
      online: false,
      model: getGeminiModelName(),
      message: 'Cloud connectivity check failed.',
    };
  }
}

function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned;
}


export async function generateReport(
  verifiedData: AuthoritativeDischargeData,
  language: SupportedLanguage = 'en',
  version: number = 1
): Promise<GeneratedReport> {
  const isGenerationEnabled = process.env.GEMINI_GENERATION_ENABLED === 'true';

  // Default: Deterministic local template generation (0 Gemini API calls)
  if (!isGenerationEnabled || language === 'en') {
    return buildFallbackReport(verifiedData, language, version);
  }

  const ai = getGeminiClient();
  const model = getGeminiModelName();

  const langNames: Record<SupportedLanguage, string> = {
    en: 'English',
    hi: 'Hindi',
    ta: 'Tamil',
  };

  const systemPrompt = GENERATION_SYSTEM_PROMPT.replace('{{LANGUAGE}}', langNames[language]);

  const verifiedPayload = JSON.stringify(verifiedData, null, 2);

  if (!ai) {
    return buildFallbackReport(verifiedData, language, version);
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          text: `${systemPrompt}\n\nVERIFIED AUTHORITATIVE PATIENT DATA:\n${verifiedPayload}`,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const cleaned = cleanJsonText(response.text || '');
    const parsed = JSON.parse(cleaned);

    const reportId = `rep-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return {
      id: reportId,
      version,
      language,
      patientName: verifiedData.patient.name.value || 'Patient',
      patientId: verifiedData.patient.patientId.value || 'UNKNOWN',
      title: parsed.title || `Discharge Instructions (${langNames[language]})`,
      sections: {
        summary: parsed.sections?.summary || '',
        diagnosisAndProcedures: parsed.sections?.diagnosisAndProcedures || '',
        medicationInstructions: parsed.sections?.medicationInstructions || '',
        dietAndActivity: parsed.sections?.dietAndActivity || '',
        woundCareAndHygiene: parsed.sections?.woundCareAndHygiene || '',
        followUpAppointments: parsed.sections?.followUpAppointments || '',
        warningSignsAndEmergency: parsed.sections?.warningSignsAndEmergency || '',
        additionalInstructions: parsed.sections?.additionalInstructions || '',
      },
      rawMarkdown: parsed.rawMarkdown || buildRawMarkdownFromSections(parsed.sections),
      generatedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Cloud generation failed.');
    return buildFallbackReport(verifiedData, language, version);
  }
}

export async function runSemanticAuditAi(
  verifiedData: AuthoritativeDischargeData,
  report: GeneratedReport
): Promise<AuditFinding[]> {
  const isAuditAiEnabled = process.env.GEMINI_AUDIT_ENABLED === 'true';

  if (!isAuditAiEnabled) {
    return []; // Handled by deterministic 18-category safety audit engine
  }

  const ai = getGeminiClient();
  const model = getGeminiModelName();

  if (!ai) {
    throw new Error('Cloud audit is not configured.');
  }

  try {
    const prompt = `${SEMANTIC_AUDIT_PROMPT}\n\nVERIFIED AUTHORITATIVE PATIENT DATA:\n${JSON.stringify(
      verifiedData,
      null,
      2
    )}\n\nGENERATED REPORT (Version ${report.version}, Language: ${report.language}):\n${JSON.stringify(
      report.sections,
      null,
      2
    )}`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(2500),
      },
    });

    const cleaned = cleanJsonText(response.text || '');
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed) && parsed.length <= 100) {
      if (parsed.some((item: any) => !item || ['title', 'verifiedSourceText', 'generatedReportText', 'whyItMatters'].some(key => item[key] !== undefined && (typeof item[key] !== 'string' || item[key].length > 2000)) || !['PATIENT_INFORMATION','DIAGNOSIS','PROCEDURES','MEDICATIONS','ALLERGIES','FOLLOW_UP','OMISSIONS','NUMERIC_VALUES','DATES','DIET','ACTIVITY_RESTRICTIONS','WOUND_PROCEDURE_CARE','WARNING_SIGNS','EMERGENCY_INSTRUCTIONS','UNSUPPORTED_CLAIMS','CONTRADICTIONS','MEDICAL_MEANING','WORDING'].includes(item.category) || !['CRITICAL','HIGH','MEDIUM','LOW'].includes(item.severity) || !['PASS','REVIEW_REQUIRED','CRITICAL_ISSUE'].includes(item.status))) throw new Error('Invalid cloud audit result.');
      return parsed.map((item: any, idx: number) => ({
        id: `sem-aud-${Date.now()}-${idx}`,
        category: item.category,
        categoryName: formatCategoryName(item.category),
        severity: item.severity || 'MEDIUM',
        status: item.status || 'REVIEW_REQUIRED',
        title: item.title || 'Semantic check result',
        verifiedSourceText: item.verifiedSourceText || 'Verified record',
        generatedReportText: item.generatedReportText || 'Generated section',
        whyItMatters: item.whyItMatters || 'Evaluated by semantic compliance engine',
        isDeterministic: false,
      }));
    }
    throw new Error('Invalid cloud audit result.');
  } catch {
    throw new Error('Requested cloud audit did not complete.');
  }
}

export async function regenerateSectionAi(
  verifiedData: AuthoritativeDischargeData,
  sectionKey: keyof GeneratedReport['sections'],
  currentText: string,
  instruction: string,
  language: SupportedLanguage
): Promise<string> {
  const ai = getGeminiClient();
  const model = getGeminiModelName();

  if (!ai) {
    throw new Error('Cloud regeneration is not configured.');
  }

  try {
    const prompt = `${REGENERATION_SYSTEM_PROMPT.replace(
      '{{LANGUAGE}}',
      language
    )}\n\nVERIFIED DATA:\n${JSON.stringify(
      verifiedData,
      null,
      2
    )}\n\nSECTION KEY: ${sectionKey}\nCURRENT SECTION TEXT:\n${currentText}\n\nCLINICIAN REVISION INSTRUCTION:\n${instruction}`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

    return response.text?.trim() || currentText;
  } catch (err: any) {
    throw new Error('Cloud regeneration failed. Edit the section manually.');
  }
}

function formatCategoryName(cat: string): string {
  return cat
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function buildRawMarkdownFromSections(sections: any): string {
  if (!sections) return '';
  return `
# Summary
${sections.summary || ''}

# Diagnosis & Procedures
${sections.diagnosisAndProcedures || ''}

# Medication Instructions
${sections.medicationInstructions || ''}

# Diet & Activity
${sections.dietAndActivity || ''}

# Wound Care & Hygiene
${sections.woundCareAndHygiene || ''}

# Follow-Up Appointments
${sections.followUpAppointments || ''}

# Warning Signs & Emergency Instructions
${sections.warningSignsAndEmergency || ''}

# Additional Notes
${sections.additionalInstructions || ''}
  `.trim();
}

function normalizeStructuredInfo(data: any): StructuredDischargeInfo {
  return {
    patient: {
      name: data?.patient?.name || { value: '', status: 'MISSING' },
      patientId: data?.patient?.patientId || { value: '', status: 'MISSING' },
      age: data?.patient?.age || { value: '', status: 'MISSING' },
      gender: data?.patient?.gender || { value: '', status: 'MISSING' },
    },
    diagnosis: Array.isArray(data?.diagnosis) ? data.diagnosis : [],
    procedures: Array.isArray(data?.procedures) ? data.procedures : [],
    medications: Array.isArray(data?.medications)
      ? data.medications.map((m: any, i: number) => ({
          id: m.id || `med-${i + 1}`,
          name: m.name || 'Unspecified Medication',
          dosage: m.dosage || '',
          dosageStatus: m.dosageStatus || (m.dosage ? 'FOUND' : 'MISSING'),
          frequency: m.frequency || '',
          frequencyStatus: m.frequencyStatus || (m.frequency ? 'FOUND' : 'MISSING'),
          duration: m.duration || '',
          durationStatus: m.durationStatus || (m.duration ? 'FOUND' : 'MISSING'),
          instructions: m.instructions || '',
          instructionsStatus: m.instructionsStatus || 'FOUND',
          overallStatus: m.overallStatus || (m.name ? 'FOUND' : 'UNCLEAR'),
        }))
      : [],
    allergies: Array.isArray(data?.allergies) ? data.allergies : [],
    diet: Array.isArray(data?.diet) ? data.diet : [],
    activityRestrictions: Array.isArray(data?.activityRestrictions) ? data.activityRestrictions : [],
    woundCare: Array.isArray(data?.woundCare) ? data.woundCare : [],
    followUp: Array.isArray(data?.followUp)
      ? data.followUp.map((f: any, i: number) => ({
          id: f.id || `fu-${i + 1}`,
          provider: f.provider || '',
          date: f.date || '',
          time: f.time || '',
          location: f.location || '',
          instructions: f.instructions || '',
          status: f.status || 'FOUND',
        }))
      : [],
    warningSigns: Array.isArray(data?.warningSigns) ? data.warningSigns : [],
    emergencyInstructions: Array.isArray(data?.emergencyInstructions)
      ? data.emergencyInstructions
      : [],
    additionalNotes: Array.isArray(data?.additionalNotes) ? data.additionalNotes : [],
  };
}

function countFields(data: StructuredDischargeInfo): number {
  let count = 4; // patient fields
  count += data.diagnosis.length;
  count += data.procedures.length;
  count += data.medications.length * 4;
  count += data.allergies.length;
  count += data.diet.length;
  count += data.activityRestrictions.length;
  count += data.woundCare.length;
  count += data.followUp.length;
  count += data.warningSigns.length;
  count += data.emergencyInstructions.length;
  return count;
}

function countStatus(data: StructuredDischargeInfo, statusStr: 'FOUND' | 'MISSING' | 'UNCLEAR'): number {
  let count = 0;
  if (data.patient.name.status === statusStr) count++;
  if (data.patient.patientId.status === statusStr) count++;
  if (data.patient.age.status === statusStr) count++;
  if (data.patient.gender.status === statusStr) count++;

  data.diagnosis.forEach((d) => d.status === statusStr && count++);
  data.procedures.forEach((p) => p.status === statusStr && count++);
  data.medications.forEach((m) => {
    if (m.dosageStatus === statusStr) count++;
    if (m.frequencyStatus === statusStr) count++;
    if (m.durationStatus === statusStr) count++;
  });
  data.allergies.forEach((a) => a.status === statusStr && count++);
  data.diet.forEach((dt) => dt.status === statusStr && count++);
  data.activityRestrictions.forEach((ar) => ar.status === statusStr && count++);
  data.woundCare.forEach((wc) => wc.status === statusStr && count++);
  data.followUp.forEach((fu) => fu.status === statusStr && count++);
  data.warningSigns.forEach((ws) => ws.status === statusStr && count++);
  data.emergencyInstructions.forEach((em) => em.status === statusStr && count++);

  return count;
}



export function buildFallbackReport(
  verifiedData: AuthoritativeDischargeData,
  language: SupportedLanguage,
  version: number
): GeneratedReport {
  const pName = verifiedData.patient.name.value || 'Patient';
  const pId = verifiedData.patient.patientId.value || 'UNKNOWN';

  const medsText = verifiedData.medications
    .map(
      (m) =>
        `- **${m.name}** (Dose: ${m.dosageStatus === 'FOUND' && m.dosage ? m.dosage : 'Not specified'}), Frequency: ${
          m.frequencyStatus === 'FOUND' && m.frequency ? m.frequency : 'Not specified'
        }, Duration: ${m.durationStatus === 'FOUND' && m.duration ? m.duration : 'Not specified'}. ${m.instructionsStatus === 'FOUND' ? m.instructions : ''}`
    )
    .join('\n');

  const diagText = verifiedData.diagnosis.map((d) => `- ${d.value}`).join('\n');
  const procText = verifiedData.procedures.map((p) => `- ${p.value}`).join('\n');
  const dietText = verifiedData.diet.map((dt) => `- ${dt.value}`).join('\n');
  const actText = verifiedData.activityRestrictions.map((a) => `- ${a.value}`).join('\n');
  const woundText = verifiedData.woundCare.map((w) => `- ${w.value}`).join('\n');
  const warningText = verifiedData.warningSigns.map((ws) => `- ${ws.value}`).join('\n');
  const emergText = verifiedData.emergencyInstructions.map((em) => `- ${em.value}`).join('\n');
  const fuText = verifiedData.followUp
    .map((f) => `- **${f.provider}** on ${f.date} at ${f.time} (${f.location}). ${f.instructions}`)
    .join('\n');

  if (language === 'hi') {
    return {
      id: `rep-${Date.now()}`,
      version,
      language: 'hi',
      patientName: pName,
      patientId: pId,
      title: `डिस्चार्ज निर्देश — ${pName} (${pId})`,
      sections: {
        summary: `${pName} जी, आपके अस्पताल में रहने के बाद यह आपके डिस्चार्ज निर्देश हैं। कृपया अपनी दवाइयां समय पर लें और विश्राम करें।`,
        diagnosisAndProcedures: `निदान (Diagnosis):\n${diagText}\n\nउपचार (Procedures):\n${procText}`,
        medicationInstructions: `दवाइयों के निर्देश:\n${medsText}`,
        dietAndActivity: `आहार (Diet):\n${dietText}\n\nशारीरिक गतिविधियां (Activity Restrictions):\n${actText}`,
        woundCareAndHygiene: `घाव एवं पट्टी की देखभाल (Wound Care):\n${woundText}`,
        followUpAppointments: `अगली जांच (Follow-Up Appointments):\n${fuText}`,
        warningSignsAndEmergency: `चेतावनी के लक्षण (Warning Signs):\n${warningText}\n\nआपातकालीन निर्देश:\n${emergText}`,
        additionalInstructions: 'कृपया किसी भी समस्या के लिए तुरंत अस्पताल से संपर्क करें।',
      },
      rawMarkdown: 'Hindi report',
      generatedAt: new Date().toISOString(),
    };
  }

  if (language === 'ta') {
    return {
      id: `rep-${Date.now()}`,
      version,
      language: 'ta',
      patientName: pName,
      patientId: pId,
      title: `டிஸ்சார்ஜ் வழிகாட்டுதல்கள் — ${pName} (${pId})`,
      sections: {
        summary: `திரு/திருமதி ${pName} அவர்களின் மருத்துவமனை சிகிச்சைக்குப் பிறகு வழங்கப்பட்டுள்ள வழிகாட்டுதல்கள் கீழே கொடுக்கப்பட்டுள்ளன.`,
        diagnosisAndProcedures: `நோய் கண்டறிதல்:\n${diagText}\n\nமேற்கொள்ளப்பட்ட சிகிச்சைகள்:\n${procText}`,
        medicationInstructions: `மருந்து வழிகாட்டுதல்கள்:\n${medsText}`,
        dietAndActivity: `உணவு முறை:\n${dietText}\n\nஉடற்பயிற்சி மற்றும் கட்டுப்பாடுகள்:\n${actText}`,
        woundCareAndHygiene: `காயம் பராமரிப்பு:\n${woundText}`,
        followUpAppointments: `அடுத்த மருத்துவ சந்திப்பு:\n${fuText}`,
        warningSignsAndEmergency: `எச்சரிக்கை அறிகுறிகள்:\n${warningText}\n\nஅவசர கால வழிமுறைகள்:\n${emergText}`,
        additionalInstructions: 'சந்தேகங்கள் அல்லது அவசர நிலைக்கு மருத்துவமனையை தொடர்பு கொள்ளவும்.',
      },
      rawMarkdown: 'Tamil report',
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    id: `rep-${Date.now()}`,
    version,
    language: 'en',
    patientName: pName,
    patientId: pId,
    title: `Discharge Instructions — ${pName} (${pId})`,
    sections: {
      summary: `Patient ID: ${pId}. Dear ${pName}, here are your clinician-verified discharge instructions following your hospital stay. Please review all sections carefully and follow the prescribed routine.`,
      diagnosisAndProcedures: `### Primary Diagnoses\n${diagText}\n\n### Procedures Performed\n${procText}`,
      medicationInstructions: `### Your Medications\n${medsText}`,
      dietAndActivity: `### Diet Guidelines\n${dietText}\n\n### Activity Restrictions\n${actText}`,
      woundCareAndHygiene: `### Incision & Wound Care\n${woundText}`,
      followUpAppointments: `### Upcoming Appointments\n${fuText}`,
      warningSignsAndEmergency: `### Warning Signs to Watch For\n${warningText}\n\n### Emergency Action\n${emergText}`,
      additionalInstructions: '### Known Allergies\n' + (verifiedData.allergies.map(item => '- ' + item.value).join('\n') || 'Not specified') + '\n\n### Additional Notes\n' + verifiedData.additionalNotes.map(item => '- ' + item.value).join('\n'),
    },
    rawMarkdown: 'English report',
    generatedAt: new Date().toISOString(),
  };
}
