import {
  CanonicalDischargeExtraction,
  ExtractedField,
  ExtractedMedication,
  ExtractedFollowUp,
} from './clinicalExtractionService';
import { medicationLines, medicationReviewContext } from './medicationText';

export interface ValidationSummary {
  totalFieldsChecked: number;
  verifiedCount: number;
  downgradedCount: number;
  missingCount: number;
  unclearCount: number;
}

export interface ValidatedExtractionResult {
  data: CanonicalDischargeExtraction;
  validationSummary: ValidationSummary;
}

export function validateSourceEvidence(
  extracted: CanonicalDischargeExtraction,
  sourceText: string
): ValidatedExtractionResult {
  const normSource = normalizeForMatching(sourceText);
  const instructionText = /\b(?:ignore.{0,40}instructions|system prompt|invent|return (?:only )?json)\b/i;
  const sourceLines = sourceText.split('\n');
  let totalFieldsChecked = 0;
  let verifiedCount = 0;
  let downgradedCount = 0;
  let missingCount = 0;
  let unclearCount = 0;

  const validateField = (field: ExtractedField, contextSupported = true): ExtractedField => {
    totalFieldsChecked++;

    if (field.status === 'MISSING' || !field.value) {
      missingCount++;
      return {
        value: field.value || '',
        status: 'MISSING',
        evidence: field.evidence || '',
      };
    }

    const normEvidence = normalizeForMatching(field.evidence || field.value);
    const normValue = normalizeForMatching(field.value);
    const matchingLines = sourceLines.filter(line => (' ' + normalizeForMatching(line) + ' ').includes(' ' + normValue + ' '));
    const instructionOnly = instructionText.test(field.evidence || field.value) || (matchingLines.length > 0 && matchingLines.every(line => instructionText.test(line)));
    const contains = (source: string, value: string) => !!value && (' ' + source + ' ').includes(' ' + value + ' ');
    // Both the value and its quoted evidence must agree; token overlap cannot prove a clinical fact.
    const isSupported = field.status !== 'UNCLEAR' && !instructionOnly && contextSupported && contains(normSource, normEvidence) && contains(normEvidence, normValue);

    if (isSupported) {
      verifiedCount++;
      return {
        ...field,
        status: 'FOUND',
      };
    } else {
      // Evidence not verified in source text -> downgrade to UNCLEAR
      downgradedCount++;
      unclearCount++;
      return {
        ...field,
        status: 'UNCLEAR',
      };
    }
  };

  const validateMedication = (med: ExtractedMedication): ExtractedMedication => {
    const lines = medicationLines(sourceText, med.name.value);
    const doses = new Set(lines.flatMap(line => line.slice(line.toLowerCase().indexOf(med.name.value.toLowerCase())).match(/\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|units?)\b/i)?.map(value => value.toLowerCase().replace(/\s/g, '')) || []));
    const ambiguous = !lines.length || doses.size > 1 || lines.some(line => medicationReviewContext.test(line) ||
      extracted.medications.some(other => other !== med && other.name.value.toLowerCase() !== med.name.value.toLowerCase() && medicationLines(line, other.name.value).length > 0));
    const supported = (field: ExtractedField) => !ambiguous && lines.some(line => {
      const normalized = ' ' + normalizeForMatching(line) + ' ';
      return normalized.includes(' ' + normalizeForMatching(field.evidence || field.value) + ' ');
    });
    return {
      name: validateField(med.name, supported(med.name)),
      dosage: validateField(med.dosage, supported(med.dosage)),
      frequency: validateField(med.frequency, supported(med.frequency)),
      duration: validateField(med.duration, supported(med.duration)),
      instructions: validateField(med.instructions, supported(med.instructions)),
    };
  };

  const validateFollowUp = (fu: ExtractedFollowUp): ExtractedFollowUp => {
    return {
      provider: validateField(fu.provider),
      date: validateField(fu.date),
      time: validateField(fu.time),
      location: validateField(fu.location),
      instructions: validateField(fu.instructions),
    };
  };

  const validatedPatient = {
    name: validateField(extracted.patient.name),
    patientId: validateField(extracted.patient.patientId),
    age: validateField(extracted.patient.age),
    gender: validateField(extracted.patient.gender),
  };

  const validatedDiagnoses = extracted.diagnoses.map(field => validateField(field));
  const validatedProcedures = extracted.procedures.map(field => validateField(field));
  const validatedMedications = extracted.medications.map(validateMedication);
  const allergyLines = sourceLines.filter(line => /allerg|\bnkda\b/i.test(line));
  const negativeAllergy = /\b(?:no known (?:drug |food )?allergies|nkda|none)\b/i;
  const conflictingAllergies = allergyLines.some(line => negativeAllergy.test(line)) && allergyLines.some(line => !negativeAllergy.test(line) && !/unknown|not (?:provided|documented)/i.test(line));
  const validatedAllergies = extracted.allergies.map(field => validateField(field, !conflictingAllergies));
  const validatedDietary = extracted.dietaryInstructions.map(field => validateField(field));
  const validatedWoundCare = extracted.woundCare.map(field => validateField(field));
  const validatedActivity = extracted.activityRestrictions.map(field => validateField(field));
  const validatedFollowUp = extracted.followUpAppointments.map(validateFollowUp);
  const validatedWarning = extracted.warningSigns.map(field => validateField(field));
  const validatedEmergency = extracted.emergencyInstructions.map(field => validateField(field));
  const validatedNotes = (extracted.additionalNotes || []).map(field => validateField(field));

  return {
    data: {
      patient: validatedPatient,
      diagnoses: validatedDiagnoses,
      procedures: validatedProcedures,
      medications: validatedMedications,
      allergies: validatedAllergies,
      dietaryInstructions: validatedDietary,
      woundCare: validatedWoundCare,
      activityRestrictions: validatedActivity,
      followUpAppointments: validatedFollowUp,
      warningSigns: validatedWarning,
      emergencyInstructions: validatedEmergency,
      additionalNotes: validatedNotes,
    },
    validationSummary: {
      totalFieldsChecked,
      verifiedCount,
      downgradedCount,
      missingCount,
      unclearCount,
    },
  };
}

function normalizeForMatching(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[µμ]g/g, 'mcg')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/[^a-z0-9.\-/%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
