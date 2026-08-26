import {
  CanonicalDischargeExtraction,
  ExtractedField,
  ExtractedMedication,
  ExtractedFollowUp,
} from './clinicalExtractionService';

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
  let totalFieldsChecked = 0;
  let verifiedCount = 0;
  let downgradedCount = 0;
  let missingCount = 0;
  let unclearCount = 0;

  const validateField = (field: ExtractedField): ExtractedField => {
    totalFieldsChecked++;

    if (field.status === 'MISSING' || !field.value) {
      missingCount++;
      return {
        value: field.value || '',
        status: 'MISSING',
        evidence: field.evidence || '',
      };
    }

    if (!normSource) {
      // If no source text is available for verification, preserve state
      if (field.status === 'FOUND') verifiedCount++;
      if (field.status === 'UNCLEAR') unclearCount++;
      return field;
    }

    const evidenceText = field.evidence || field.value;
    const normEvidence = normalizeForMatching(evidenceText);
    const normValue = normalizeForMatching(field.value);

    // Conservative matching: check if evidence or value is present in normalized source text
    const isEvidenceMatch = normEvidence && normSource.includes(normEvidence);
    const isValueMatch = normValue && normSource.includes(normValue);

    // Partial token match check for multi-word evidence (e.g. key tokens present)
    const tokens = normEvidence.split(' ').filter((t) => t.length > 2);
    const tokenMatchRatio =
      tokens.length > 0
        ? tokens.filter((t) => normSource.includes(t)).length / tokens.length
        : 0;

    const isSupported = isEvidenceMatch || isValueMatch || tokenMatchRatio >= 0.75;

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
    return {
      name: validateField(med.name),
      dosage: validateField(med.dosage),
      frequency: validateField(med.frequency),
      duration: validateField(med.duration),
      instructions: validateField(med.instructions),
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

  const validatedDiagnoses = extracted.diagnoses.map(validateField);
  const validatedProcedures = extracted.procedures.map(validateField);
  const validatedMedications = extracted.medications.map(validateMedication);
  const validatedAllergies = extracted.allergies.map(validateField);
  const validatedDietary = extracted.dietaryInstructions.map(validateField);
  const validatedWoundCare = extracted.woundCare.map(validateField);
  const validatedActivity = extracted.activityRestrictions.map(validateField);
  const validatedFollowUp = extracted.followUpAppointments.map(validateFollowUp);
  const validatedWarning = extracted.warningSigns.map(validateField);
  const validatedEmergency = extracted.emergencyInstructions.map(validateField);

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
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
