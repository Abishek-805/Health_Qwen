import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { jsPDF } from 'jspdf';
import { mockApprovedDoc } from '../tests/fixtures/pdfTestDocument';
import { generateReport } from '../ai/geminiService';
import { executeHybridAudit } from '../audit/hybridAudit';
import { generateApprovedDischargePdf } from '../services/serverPdfGenerator';
import { extractDocumentSource } from '../services/documentSourceService';
import { ratio } from './metrics';
import { AUDIT_POLICY_VERSION } from '../audit/deterministicAudit';
import type { GeneratedReport } from '../../src/types/discharge';

process.env.CLOUD_PROCESSING_ENABLED = 'false'; process.env.GEMINI_AUDIT_ENABLED = 'false'; process.env.GEMINI_GENERATION_ENABLED = 'false';
const source = structuredClone(mockApprovedDoc.verifiedData!);
source.warningSigns = [{ value: 'Synthetic warning symptom', status: 'FOUND' }];
const cases: Array<{ id: string; categories: string[]; change: (report: GeneratedReport) => void }> = [
  { id: 'unchanged-template', categories: [], change: () => {} },
  { id: 'patient-id', categories: ['PATIENT_INFORMATION'], change: report => { report.patientId = 'WRONG-SYNTHETIC-ID'; } },
  { id: 'medication-dose', categories: ['MEDICATIONS'], change: report => { report.sections.medicationInstructions = 'Cefuroxime 1000 mg twice daily for 5 days.'; } },
  { id: 'medication-unit', categories: ['MEDICATIONS', 'NUMERIC_VALUES'], change: report => { report.sections.medicationInstructions = 'Cefuroxime 500 mcg twice daily for 5 days.'; } },
  { id: 'medication-frequency', categories: ['MEDICATIONS'], change: report => { report.sections.medicationInstructions = 'Cefuroxime 500 mg once daily for 5 days.'; } },
  { id: 'medication-duration', categories: ['MEDICATIONS'], change: report => { report.sections.medicationInstructions = 'Cefuroxime 500 mg twice daily for 15 days.'; } },
  { id: 'negated-medication', categories: ['MEDICATIONS'], change: report => { report.sections.medicationInstructions = 'Do not take Cefuroxime 500 mg twice daily for 5 days.'; } },
  { id: 'allergy-omission', categories: ['ALLERGIES'], change: report => { report.sections.additionalInstructions = ''; } },
  { id: 'warning-omission', categories: ['OMISSIONS'], change: report => { report.sections.warningSignsAndEmergency = 'Warning signs and emergency action'; } },
];
const results = [];
let tp = 0, fp = 0, fn = 0;
for (const row of cases) {
  const report = await generateReport(source); row.change(report);
  const result = await executeHybridAudit(source, report);
  const actual = [...new Set(result.findings.filter(f => f.status === 'CRITICAL_ISSUE' || f.severity === 'CRITICAL').map(f => f.category))];
  tp += actual.filter(category => row.categories.includes(category)).length;
  fp += actual.filter(category => !row.categories.includes(category)).length;
  fn += row.categories.filter(category => !actual.includes(category as any)).length;
  results.push({ id: row.id, expectedCriticalCategories: row.categories, actualCriticalCategories: actual,
    blockingVerdictCorrect: (result.overallStatus === 'CRITICAL_ISSUE') === (row.categories.length > 0),
    unevaluatedCategories: Object.values(result.categorySummaries).filter(category => category.status === 'NOT_EVALUATED').length,
    passCountCorrect: result.passCount === Object.values(result.categorySummaries).filter(category => category.status === 'PASS').length });
}
const report = await generateReport(source);
const sectionKeys = Object.keys(report.sections) as Array<keyof GeneratedReport['sections']>;
sectionKeys.forEach((key, index) => { report.sections[key] += `\nSYNTHETIC SECTION MARKER ${index}.`; });
const approved = { ...structuredClone(mockApprovedDoc), verifiedData: source, generatedReport: report, currentVersion: report.version, auditResult: await executeHybridAudit(source, report) };
const parser = new PDFParse({ data: generateApprovedDischargePdf(approved).buffer });
let pdfSectionMarkers = 0;
try { const { text } = await parser.getText(); pdfSectionMarkers = sectionKeys.filter((_key, index) => text.includes(`SYNTHETIC SECTION MARKER ${index}`)).length; } finally { await parser.destroy(); }
let ocr = null;
if (process.argv.includes('--ocr')) {
  const lines = ['SYNTHETIC OCR FIXTURE', 'Patient Name: Avery Example', 'Patient ID: SYN-001', 'Medication: Cefuroxime 500 mg'];
  const pdf = new jsPDF(); pdf.setFontSize(16); lines.forEach((line, index) => pdf.text(line, 15, 20 + index * 12));
  const imageParser = new PDFParse({ data: Buffer.from(pdf.output('arraybuffer')) });
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  const distance = (a: string[], b: string[]) => { let previous = Array.from({ length: b.length + 1 }, (_, index) => index); for (let i = 0; i < a.length; i++) { const current = [i + 1]; for (let j = 0; j < b.length; j++) current.push(Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + Number(a[i] !== b[j]))); previous = current; } return previous[b.length]; };
  try {
    const rendered = await imageParser.getScreenshot({ desiredWidth: 1600 }); const started = performance.now();
    const extracted = await extractDocumentSource({ fileBuffer: Buffer.from(rendered.pages[0].data), mimeType: 'image/png' });
    const expected = normalize(lines.join(' ')), predicted = normalize(extracted.originalText);
    ocr = { cases: 1, characterErrorRate: ratio(distance([...expected], [...predicted]), expected.length), wordErrorRate: ratio(distance(expected.split(' '), predicted.split(' ')), expected.split(' ').length), latencyMs: Math.round(performance.now() - started), engine: extracted.extractionMethod };
  } finally { await imageParser.destroy(); }
}
const summary = { datasetVersion: 'synthetic-pipeline-v1', auditPolicyVersion: AUDIT_POLICY_VERSION, date: new Date().toISOString(), clinicianReviewed: false,
  auditCases: cases.length, criticalCategoryPrecision: ratio(tp, tp + fp), criticalCategoryRecall: ratio(tp, tp + fn), truePositive: tp, falsePositive: fp, falseNegative: fn,
  blockingVerdictsCorrect: results.filter(row => row.blockingVerdictCorrect).length, pdfSectionMarkers, expectedPdfSectionMarkers: sectionKeys.length, ocr,
  notMeasured: ['clinical acceptance', 'human source verification', 'end-to-end browser approval in this evaluator'], results };
fs.mkdirSync('.runtime', { recursive: true }); fs.writeFileSync('.runtime/pipeline-evaluation.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ auditCases: summary.auditCases, blockingVerdictsCorrect: summary.blockingVerdictsCorrect, criticalCategoryPrecision: summary.criticalCategoryPrecision, criticalCategoryRecall: summary.criticalCategoryRecall, pdfSectionMarkers, ocr }));
if (fp || fn || summary.blockingVerdictsCorrect !== cases.length || pdfSectionMarkers !== sectionKeys.length || results.some(row => !row.passCountCorrect)) process.exitCode = 1;
