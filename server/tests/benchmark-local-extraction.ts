import { extractClinicalDataLocal } from '../services/localClinicalExtractionService.js';
import { validateSourceEvidence } from '../services/sourceEvidenceValidator.js';
import { normalizeText } from '../services/textNormalizationService.js';

export async function runLocalExtractionBenchmark() {
  console.log('====================================================');
  console.log('RUNNING LOCAL QWEN2.5-1.5B EXTRACTION BENCHMARK');
  console.log('====================================================');

  const testCases = [
    {
      name: 'Structured Text Input',
      input: `PATIENT: Michael Chang
PATIENT ID: PAT-99214
AGE: 58
GENDER: Male
DIAGNOSIS: Acute Coronary Syndrome
PROCEDURE: Percutaneous Coronary Intervention
MEDICATION: Aspirin 81 mg once daily for 90 days.
MEDICATION: Atorvastatin 40 mg bedtime.`,
    },
    {
      name: 'Narrative Paragraph Input',
      input: `Patient David Miller is a 64-year-old male who was admitted with acute cholecystitis and underwent laparoscopic cholecystectomy. He was discharged with Ciprofloxacin 500 mg twice daily for 7 days. Follow up with Dr. Robert Evans at City Heart Clinic in 2 weeks.`,
    },
    {
      name: 'Missing Frequency & Duration Test',
      input: `Patient: Elena Rostova
Medication: Clopidogrel 75 mg.`,
    },
    {
      name: 'Maximum Dose Anchor Test',
      input: `Patient: Thomas Wright
Medication: Acetaminophen 500 mg every 6 hours as needed for pain. Maximum 3000 mg per 24 hours.`,
    },
    {
      name: 'Standalone Maximum Dose Test (No Medication Anchor)',
      input: `Do not take more than 3000 mg in 24 hours. Drink plenty of water.`,
    },
    {
      name: 'Patient vs Doctor Semantic Context Test',
      input: `DISCHARGE SUMMARY
PATIENT NAME: ARTHUR PENDLETON
AGE: 71
GENDER: Male
ATTENDING PHYSICIAN: Dr. Elizabeth Vance, MD
SURGEON: Dr. Marcus Brody, MD
DIAGNOSIS: Osteoarthritis of Right Knee
PROCEDURE: Total Knee Arthroplasty`,
    },
    {
      name: 'Unseen Synthetic Document (Randomized)',
      input: `Patient: Victor Vance (PAT-8812-X)
Age: 45 | Gender: Male
Condition: Left Renal Calculi
Procedure: Extracorporeal Shock Wave Lithotripsy
Medications:
1. Tamsulosin 0.4 mg once daily after breakfast for 14 days
2. Ibuprofen 400 mg every 8 hours as needed. Maximum 1200 mg in 24 hours.
Allergies: Penicillin
Follow-up: Dr. Sarah Jenkins at Urology Clinic on Sept 12 at 10:00 AM.`,
    },
  ];

  let totalLatency = 0;
  let totalTokens = 0;
  let successCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`\n----------------------------------------------------`);
    console.log(`RUNNING BENCHMARK ${i + 1}/${testCases.length}: ${tc.name}`);
    console.log(`----------------------------------------------------`);

    const norm = normalizeText(tc.input);
    const start = Date.now();
    const result = await extractClinicalDataLocal(norm.normalizedText);
    const elapsed = Date.now() - start;

    const validated = validateSourceEvidence(result.data, norm.originalText);

    totalLatency += elapsed;
    totalTokens += result.metrics.totalTokens;
    successCount++;

    console.log(`✅ Device: ${result.metrics.device}`);
    console.log(`⏱️ Latency: ${elapsed} ms`);
    console.log(`⚡ Speed: ${result.metrics.tokensPerSec} tokens/sec`);
    console.log(`💾 RAM Used: ${result.metrics.systemRamUsedMb} MB | VRAM: ${result.metrics.vramUsedMb} MB`);
    console.log(`👤 Patient Extracted: ${validated.data.patient.name.value} (ID: ${validated.data.patient.patientId.value})`);
    console.log(`💊 Medications Extracted: ${validated.data.medications.length}`);
    validated.data.medications.forEach((m) => {
      console.log(`   - ${m.name.value} | Dose: ${m.dosage.value} | Freq: ${m.frequency.value} | Dur: ${m.duration.value} | Instr: ${m.instructions.value}`);
    });
    console.log(`📅 Follow-Up Appointments: ${validated.data.followUpAppointments.length}`);
    validated.data.followUpAppointments.forEach((fu) => {
      console.log(`   - Provider: "${fu.provider.value}" | Date: "${fu.date.value}" | Time: "${fu.time.value}" | Loc: "${fu.location.value}" | Instr: "${fu.instructions.value}"`);
    });
  }

  const avgLatency = Math.round(totalLatency / testCases.length);
  const avgTokensPerSec = (totalTokens / (totalLatency / 1000)).toFixed(1);

  console.log('\n====================================================');
  console.log('BENCHMARK SUMMARY RESULTS');
  console.log('====================================================');
  console.log(`Model: Qwen2.5-1.5B-Instruct Q4_K_M GGUF`);
  console.log(`Documents Tested: ${testCases.length}`);
  console.log(`Successful Extractions: ${successCount}/${testCases.length}`);
  console.log(`Average Latency: ${avgLatency} ms`);
  console.log(`Average Tokens/Sec: ${avgTokensPerSec}`);
  console.log(`Gemini API Calls: 0`);
  console.log('====================================================\n');
}

if (process.argv[1]?.includes('benchmark-local-extraction')) {
  runLocalExtractionBenchmark()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark execution error:', err);
      process.exit(1);
    });
}
