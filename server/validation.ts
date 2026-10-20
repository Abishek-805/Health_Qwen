import type { AuthoritativeDischargeData, GeneratedReport, HospitalInfo, FieldStatus } from '../src/types/discharge';
import { clinicianIdentity } from './security';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Expected an object.');
  return value;
}
export function text(value: unknown, max = 2000, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpError(400, 'A text field is missing or too long.');
  return value;
}
function status(value: unknown): FieldStatus {
  if (!['FOUND', 'MISSING', 'UNCLEAR'].includes(value as string)) throw new HttpError(400, 'Invalid clinical field status.');
  return value as FieldStatus;
}
function field(value: unknown) {
  const item = object(value);
  return { value: text(item.value), status: status(item.status) };
}
function list<T>(value: unknown, parse: (item: any) => T): T[] {
  if (!Array.isArray(value) || value.length > 100) throw new HttpError(400, 'Expected at most 100 clinical items per field.');
  return value.map(parse);
}
export function verified(value: unknown): AuthoritativeDischargeData {
  const input = object(value), patient = object(input.patient);
  if (input.isConfirmedAuthoritative !== true) throw new HttpError(400, 'Confirm the clinical data before continuing.');
  const result: AuthoritativeDischargeData = {
    patient: { name: field(patient.name), patientId: field(patient.patientId), age: field(patient.age), gender: field(patient.gender) },
    diagnosis: list(input.diagnosis, field), procedures: list(input.procedures, field), allergies: list(input.allergies, field),
    diet: list(input.diet, field), activityRestrictions: list(input.activityRestrictions, field), woundCare: list(input.woundCare, field),
    warningSigns: list(input.warningSigns, field), emergencyInstructions: list(input.emergencyInstructions, field), additionalNotes: list(input.additionalNotes, field),
    medications: list(input.medications, value => {
      const item = object(value);
      return { id: text(item.id, 200), name: text(item.name, 500, true), dosage: text(item.dosage), dosageStatus: status(item.dosageStatus),
        frequency: text(item.frequency), frequencyStatus: status(item.frequencyStatus), duration: text(item.duration), durationStatus: status(item.durationStatus),
        instructions: text(item.instructions), instructionsStatus: status(item.instructionsStatus), overallStatus: status(item.overallStatus) };
    }),
    followUp: list(input.followUp, value => {
      const item = object(value);
      return { id: text(item.id, 200), provider: text(item.provider), date: text(item.date), time: text(item.time), location: text(item.location), instructions: text(item.instructions), status: status(item.status) };
    }),
    verifiedAt: new Date().toISOString(), verifiedBy: clinicianIdentity(), isConfirmedAuthoritative: true,
  };
  const hasUnclear = (value: unknown): boolean => !!value && typeof value === 'object' && Object.entries(value).some(([key, item]) => (key.toLowerCase().endsWith('status') && item === 'UNCLEAR') || hasUnclear(item));
  if (hasUnclear(result)) throw new HttpError(400, 'Resolve every UNCLEAR field before confirming the source.');
  text(result.patient.name.value, 200, true); text(result.patient.patientId.value, 200, true);
  return result;
}
export const sectionKeys = ['summary', 'diagnosisAndProcedures', 'medicationInstructions', 'dietAndActivity', 'woundCareAndHygiene', 'followUpAppointments', 'warningSignsAndEmergency', 'additionalInstructions'] as const;
export function report(value: unknown): GeneratedReport {
  const input = object(value), sections = object(input.sections);
  if (input.language !== 'en') throw new HttpError(400, 'Only English reports are supported.');
  if (!Number.isSafeInteger(input.version) || input.version < 1) throw new HttpError(400, 'Invalid report version.');
  return { id: text(input.id, 200, true), version: input.version, language: 'en', patientName: text(input.patientName, 200, true), patientId: text(input.patientId, 200, true),
    title: text(input.title, 500), sections: { summary: text(sections.summary, 20_000), diagnosisAndProcedures: text(sections.diagnosisAndProcedures, 20_000), medicationInstructions: text(sections.medicationInstructions, 20_000), dietAndActivity: text(sections.dietAndActivity, 20_000), woundCareAndHygiene: text(sections.woundCareAndHygiene, 20_000), followUpAppointments: text(sections.followUpAppointments, 20_000), warningSignsAndEmergency: text(sections.warningSignsAndEmergency, 20_000), additionalInstructions: text(sections.additionalInstructions, 20_000) },
    rawMarkdown: '', generatedAt: new Date().toISOString() };
}
export function hospital(value: unknown): HospitalInfo {
  const input = object(value);
  return { name: text(input.name, 200, true), department: text(input.department, 200) };
}
