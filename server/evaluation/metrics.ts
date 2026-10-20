import type { CanonicalDischargeExtraction, ExtractedField } from '../services/clinicalExtractionService';

export const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
export function flattenFields(value: unknown, prefix = '', output: Record<string, ExtractedField> = {}) {
  if (!value || typeof value !== 'object') return output;
  if ('value' in value && 'status' in value) { output[prefix] = value as ExtractedField; return output; }
  if (Array.isArray(value)) {
    const keyed = value.map(item => ({ item, key: normalize(item?.name?.value || item?.provider?.value || item?.value || '') }));
    const seen = new Map<string, number>();
    for (const { item, key } of keyed) {
      const occurrence = seen.get(key) || 0; seen.set(key, occurrence + 1);
      flattenFields(item, prefix + '[' + key + '#' + occurrence + ']', output);
    }
  } else {
    for (const [key, item] of Object.entries(value)) flattenFields(item, prefix ? prefix + '.' + key : key, output);
  }
  return output;
}
export const ratio = (numerator: number, denominator: number) => denominator === 0 ? null : numerator / denominator;
function allergyState(fields?: ExtractedField[]) {
  if (!fields?.length) return 'missing';
  const negative = (value: string) => /\b(?:no known (?:drug |food )?allergies|nkda)\b/i.test(value);
  if (fields.some(field => negative(field.value)) && fields.some(field => field.value && !negative(field.value) && !/unknown/i.test(field.value))) return 'conflicting';
  if (fields.some(field => /unknown/i.test(field.value))) return 'unknown';
  if (fields.some(field => field.status === 'UNCLEAR')) return 'unclear';
  return fields.some(field => negative(field.value)) ? 'explicit-negative' : 'positive';
}
export function scoreExtraction(expected: CanonicalDischargeExtraction, prediction?: CanonicalDischargeExtraction) {
  const gold = flattenFields(expected), predicted = flattenFields(prediction);
  const keys = Object.keys(gold);
  const match = (key: string) => !!predicted[key] && normalize(gold[key].value) === normalize(predicted[key].value) && gold[key].status === predicted[key].status;
  const valueCorrect = keys.filter(key => predicted[key] && normalize(gold[key].value) === normalize(predicted[key].value)).length;
  const goldFacts = keys.filter(key => gold[key].status === 'FOUND' && gold[key].value);
  const predictedFacts = Object.keys(predicted).filter(key => predicted[key].status === 'FOUND' && predicted[key].value);
  const truePositive = predictedFacts.filter(key => gold[key]?.status === 'FOUND' && normalize(gold[key].value) === normalize(predicted[key].value)).length;
  const falsePositive = predictedFacts.length - truePositive, falseNegative = goldFacts.length - truePositive;
  const unclearGold = keys.filter(key => gold[key].status === 'UNCLEAR');
  const unclearPredicted = Object.keys(predicted).filter(key => predicted[key].status === 'UNCLEAR');
  const unclearTruePositive = unclearPredicted.filter(key => gold[key]?.status === 'UNCLEAR').length;
  const fieldGroups = Object.fromEntries(['name', 'dosage', 'frequency', 'duration', 'allergies', 'followUpAppointments'].map(group => {
    const selected = keys.filter(key => group === 'allergies' || group === 'followUpAppointments' ? key.startsWith(group) : key.startsWith('medications[') && key.endsWith('.' + group));
    return [group, { correct: selected.filter(match).length, total: selected.length, accuracy: ratio(selected.filter(match).length, selected.length) }];
  }));
  return { correct: keys.filter(match).length, valueCorrect, valueAccuracy: ratio(valueCorrect, keys.length), total: keys.length, exactFieldAccuracy: ratio(keys.filter(match).length, keys.length),
    missingPredictions: keys.filter(key => !predicted[key]).length, truePositive, falsePositive, falseNegative,
    precision: ratio(truePositive, predictedFacts.length), recall: ratio(truePositive, goldFacts.length), f1: ratio(2 * truePositive, 2 * truePositive + falsePositive + falseNegative),
    unsupportedAssertionRate: ratio(falsePositive, predictedFacts.length), omissionRate: ratio(falseNegative, goldFacts.length),
    incorrectCertainty: predictedFacts.filter(key => gold[key]?.status === 'UNCLEAR' || gold[key]?.status === 'MISSING').length,
    unclearTruePositive, unclearPredicted: unclearPredicted.length, unclearExpected: unclearGold.length,
    unclearPrecision: ratio(unclearTruePositive, unclearPredicted.length), unclearRecall: ratio(unclearTruePositive, unclearGold.length), fieldGroups,
    allergyState: { expected: allergyState(expected.allergies), predicted: prediction ? allergyState(prediction.allergies) : 'no-prediction', correct: !!prediction && allergyState(expected.allergies) === allergyState(prediction.allergies) } };
}
