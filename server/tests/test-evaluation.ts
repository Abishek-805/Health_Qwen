import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluationCases } from '../evaluation/fixtures';
import { scoreExtraction, ratio } from '../evaluation/metrics';
import { validateSourceEvidence } from '../services/sourceEvidenceValidator';

test('metrics count missing outputs, duplicates, wrong units and zero denominators', () => {
  assert.equal(ratio(0, 0), null);
  const fixture = evaluationCases.find(row => row.id === 'decimal-dose')!;
  const exact = scoreExtraction(fixture.expected, fixture.expected);
  assert.equal(exact.exactFieldAccuracy, 1); assert.equal(exact.f1, 1);
  const missing = scoreExtraction(fixture.expected);
  assert.equal(missing.correct, 0); assert.equal(missing.missingPredictions, missing.total); assert.equal(missing.recall, 0); assert.equal(missing.precision, null);
  const wrong = structuredClone(fixture.expected); wrong.medications[0].dosage.value = '0.5 mcg';
  assert.equal(scoreExtraction(fixture.expected, wrong).falsePositive, 1);
  const duplicate = structuredClone(fixture.expected); duplicate.medications.push(structuredClone(duplicate.medications[0]));
  assert.ok(scoreExtraction(fixture.expected, duplicate).falsePositive > 0);
  const notes = evaluationCases.find(row => row.id === 'additional-notes-coverage')!;
  const lostNotes = structuredClone(notes.expected); delete lostNotes.additionalNotes;
  assert.equal(scoreExtraction(notes.expected, lostNotes).missingPredictions, 1);
});

test('metric matches medication order without silently deduplicating predictions', () => {
  const fixture = evaluationCases.find(row => row.id === 'multiple-medications')!;
  const reversed = structuredClone(fixture.expected); reversed.medications.reverse();
  assert.equal(scoreExtraction(fixture.expected, reversed).exactFieldAccuracy, 1);
});

test('uncertainty, inconsistent source and false certainty are measured', () => {
  const fixture = evaluationCases.find(row => row.id === 'discontinued-medication')!;
  const wrong = structuredClone(fixture.expected); wrong.medications[0].name.status = 'FOUND';
  assert.equal(scoreExtraction(fixture.expected, wrong).incorrectCertainty, 1);
  assert.equal(scoreExtraction(fixture.expected, wrong).valueAccuracy, 1);
  assert.ok(scoreExtraction(fixture.expected, wrong).exactFieldAccuracy! < 1);
  const conflict = evaluationCases.find(row => row.id === 'conflicting-prescriptions')!;
  const checked = validateSourceEvidence({ ...conflict.expected, medications: [{ ...conflict.expected.medications[0], name: { value: 'Cefuroxime', status: 'FOUND', evidence: 'Cefuroxime' } }] }, conflict.source);
  assert.equal(checked.data.medications[0].name.status, 'UNCLEAR');
});

test('fixture IDs are unique and all labels are explicitly synthetic and review-required', () => {
  assert.equal(evaluationCases.length, 31);
  assert.equal(new Set(evaluationCases.map(row => row.id)).size, evaluationCases.length);
  for (const row of evaluationCases) { assert.match(row.source, /SYNTHETIC/); assert.equal(row.humanReviewRequired, true); assert.ok(row.pitfalls); }
});

test('allergy-state scoring distinguishes missing, unknown and explicit negative', () => {
  const missing = evaluationCases.find(row => row.id === 'missing-allergies')!;
  const negative = evaluationCases.find(row => row.id === 'explicit-negative-allergy')!;
  const unknown = evaluationCases.find(row => row.id === 'unknown-allergies')!;
  assert.equal(scoreExtraction(missing.expected, negative.expected).allergyState.correct, false);
  assert.equal(scoreExtraction(missing.expected, missing.expected).allergyState.expected, 'missing');
  assert.equal(scoreExtraction(unknown.expected, unknown.expected).allergyState.expected, 'unknown');
});
