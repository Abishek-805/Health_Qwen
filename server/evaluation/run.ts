import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluationCases, DATASET_VERSION } from './fixtures';
import { flattenFields, ratio, scoreExtraction } from './metrics';
import { extractClinicalDataLocal, getQwenStatus, LOCAL_EXTRACTION_PROMPT_VERSION, EXTRACTION_MAX_OUTPUT_TOKENS, PROPOSAL_MAX_OUTPUT_TOKENS } from '../services/localClinicalExtractionService';
import { validateSourceEvidence } from '../services/sourceEvidenceValidator';
import { MODEL_SHA256, MODEL_REVISION, sha256File } from '../scripts/download-model';
import type { CanonicalDischargeExtraction } from '../services/clinicalExtractionService';

process.env.CLOUD_PROCESSING_ENABLED = 'false';
process.env.GEMINI_AUDIT_ENABLED = 'false';
process.env.GEMINI_GENERATION_ENABLED = 'false';
const args = process.argv.slice(2);
const option = (name: string, fallback = '') => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const useModel = args.includes('--model');
const predictionsFile = option('--predictions');
if (useModel === !!predictionsFile) throw new Error('Choose --model OR --predictions synthetic-predictions.json. No predictions are substituted from ground truth.');
const limit = Number(option('--limit', String(evaluationCases.length)));
if (!Number.isSafeInteger(limit) || limit < 1 || limit > evaluationCases.length) throw new Error('Invalid case limit.');
const output = path.resolve(option('--output', '.runtime/clinical-evaluation.json'));
const imported: Record<string, CanonicalDischargeExtraction> = predictionsFile ? JSON.parse(fs.readFileSync(predictionsFile, 'utf8')) : {};
const modelFile = getQwenStatus().modelPath;
const modelHash = useModel ? await sha256File(modelFile) : null;
if (useModel && modelHash !== MODEL_SHA256) throw new Error('Pinned model checksum mismatch.');
const results: any[] = [];
let repositoryRevision = 'unavailable';
try { repositoryRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
const packageVersion = (name: string) => JSON.parse(fs.readFileSync(path.resolve('node_modules', name, 'package.json'), 'utf8')).version;
const metadata = { datasetVersion: DATASET_VERSION, repositoryRevision, workingTree: 'inspect git diff; revision alone does not identify uncommitted changes', date: new Date().toISOString(),
  mode: useModel ? 'pinned-local-model' : 'imported-synthetic-predictions', modelFilename: useModel ? path.basename(modelFile) : null, modelSha256: modelHash, modelRevision: useModel ? MODEL_REVISION : null,
  runtime: process.version, nodeLlamaCpp: packageVersion('node-llama-cpp'), os: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, ramBytes: os.totalmem(),
  contextTokens: useModel ? 8192 : null, maxOutputTokens: useModel ? EXTRACTION_MAX_OUTPUT_TOKENS : null, inferencePasses: useModel ? 2 : null, proposalMaxOutputTokens: useModel ? PROPOSAL_MAX_OUTPUT_TOKENS : null, temperature: useModel ? 0.05 : null, seed: null,
  promptVersion: useModel ? LOCAL_EXTRACTION_PROMPT_VERSION : null, promptSourceSha256: await sha256File('server/services/localClinicalExtractionService.ts'),
  predictionsSha256: predictionsFile ? await sha256File(predictionsFile) : null,
  datasetSourceSha256: await sha256File('server/evaluation/fixtures.ts'), validatorSourceSha256: await sha256File('server/services/sourceEvidenceValidator.ts'),
  metricSourceSha256: await sha256File('server/evaluation/metrics.ts'), reconciliationSourceSha256: await sha256File('server/services/reconcileExtraction.ts'), lockfileSha256: await sha256File('package-lock.json'),
  totalDatasetCases: evaluationCases.length, requestedCases: limit, cloudEnabled: false, clinicianReviewed: false };
function save() {
  const stages = Object.fromEntries(['raw', 'validated'].map(stage => {
    const rows = results.map(row => row[stage]);
    const sum = (key: string) => rows.reduce((total, row) => total + (row?.[key] || 0), 0);
    const tp = sum('truePositive'), fp = sum('falsePositive'), fn = sum('falseNegative');
    return [stage, { correct: sum('correct'), valueCorrect: sum('valueCorrect'), valueAccuracy: ratio(sum('valueCorrect'), sum('total')), total: sum('total'), exactFieldAccuracy: ratio(sum('correct'), sum('total')), missingPredictions: sum('missingPredictions'),
      truePositive: tp, falsePositive: fp, falseNegative: fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn),
      unsupportedAssertionRate: ratio(fp, tp + fp), omissionRate: ratio(fn, tp + fn), incorrectCertainty: sum('incorrectCertainty'),
      unclearPrecision: ratio(sum('unclearTruePositive'), sum('unclearPredicted')), unclearRecall: ratio(sum('unclearTruePositive'), sum('unclearExpected')),
      allergyStateCorrect: rows.filter(row => row?.allergyState.correct).length, allergyStateTotal: rows.length, allergyStateAccuracy: ratio(rows.filter(row => row?.allergyState.correct).length, rows.length) }];
  }));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ metadata: { ...metadata, actualBackend: getQwenStatus().device }, attemptedCases: results.length,
    completedCases: results.filter(row => !row.error).length, errorCases: results.filter(row => row.error).length, stages,
    notMeasured: ['clinician correctness', 'OCR ground-truth character/word error rate', 'peak process/native/GPU memory', 'GPU utilization', 'clinical release acceptance'], results }, null, 2));
}
for (const fixture of evaluationCases.slice(0, limit)) {
  const start = performance.now();
  try {
    const extraction = useModel ? await extractClinicalDataLocal(fixture.source) : undefined;
    const prediction = extraction?.data || imported[fixture.id];
    if (!prediction) throw new Error('MISSING_PREDICTION');
    const checked = validateSourceEvidence(prediction, fixture.source);
    const assertedFields = Object.values(flattenFields(prediction)).filter(field => field.status === 'FOUND' && field.value);
    results.push({ id: fixture.id, severity: fixture.severity, humanReviewRequired: true, raw: scoreExtraction(fixture.expected, prediction), validated: scoreExtraction(fixture.expected, checked.data),
      evidenceSupportedRate: ratio(checked.validationSummary.verifiedCount, assertedFields.length), latencyMs: Math.round(performance.now() - start), runtimeMetrics: extraction?.metrics || null,
      rawPrediction: prediction, validatedPrediction: checked.data });
    console.log(`Completed synthetic case ${fixture.id}`);
  } catch (error) {
    results.push({ id: fixture.id, error: error instanceof Error && error.message === 'MISSING_PREDICTION' ? 'MISSING_PREDICTION' : 'EXTRACTION_FAILED',
      raw: scoreExtraction(fixture.expected), validated: scoreExtraction(fixture.expected), latencyMs: Math.round(performance.now() - start) });
    console.log(`Failed synthetic case ${fixture.id}; missing fields remain in denominators.`);
  }
  save();
}
console.log(`Evaluation recorded: ${results.length}/${evaluationCases.length} attempted; ${results.filter(row => !!row.error).length} error(s). Scores are not clinical validation.`);
if (results.some(row => row.error)) process.exitCode = 1;
