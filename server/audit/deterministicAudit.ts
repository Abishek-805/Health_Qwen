import {
  AuthoritativeDischargeData,
  GeneratedReport,
  AuditFinding,
} from '../../src/types/discharge';

export function runDeterministicAudit(
  verified: AuthoritativeDischargeData,
  report: GeneratedReport
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const fullText = Object.values(report.sections).join(' \n ');

  // 1. PATIENT_INFORMATION
  const verifiedId = verified.patient.patientId.value?.trim();
  const verifiedName = verified.patient.name.value?.trim();

  if (verifiedId) {
    if (report.patientId && report.patientId !== verifiedId) {
      findings.push({
        id: `det-pid-1`,
        category: 'PATIENT_INFORMATION',
        categoryName: 'Patient Information',
        severity: 'CRITICAL',
        status: 'CRITICAL_ISSUE',
        title: 'Patient ID Mismatch',
        verifiedSourceText: `Patient ID: ${verifiedId}`,
        generatedReportText: `Report Patient ID: ${report.patientId}`,
        whyItMatters: 'Report is associated with a different patient ID. Critical patient safety violation.',
        isDeterministic: true,
      });
    } else if (!fullText.toLowerCase().includes(verifiedId.toLowerCase())) {
      findings.push({
        id: `det-pid-2`,
        category: 'PATIENT_INFORMATION',
        categoryName: 'Patient Information',
        severity: 'HIGH',
        status: 'REVIEW_REQUIRED',
        title: 'Patient ID Missing in Body Text',
        verifiedSourceText: `Patient ID: ${verifiedId}`,
        generatedReportText: 'Patient ID not explicitly rendered in report body text.',
        whyItMatters: 'The patient identifier should be prominently displayed on discharge handouts.',
        isDeterministic: true,
      });
    }
  }

  if (verifiedName) {
    if (report.patientName.trim().toLowerCase().replace(/\s+/g, ' ') !== verifiedName.trim().toLowerCase().replace(/\s+/g, ' ')) {
      findings.push({
        id: `det-pname-1`,
        category: 'PATIENT_INFORMATION',
        categoryName: 'Patient Information',
        severity: 'CRITICAL',
        status: 'CRITICAL_ISSUE',
        title: 'Patient Name Mismatch',
        verifiedSourceText: `Patient Name: ${verifiedName}`,
        generatedReportText: `Report Patient Name: ${report.patientName}`,
        whyItMatters: 'Report header name does not match clinician-verified patient name.',
        isDeterministic: true,
      });
    }
  }

  // 2. DIAGNOSIS
  verified.diagnosis.forEach((d, idx) => {
    if (d.status === 'FOUND' && d.value) {
      const keywords = d.value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(' ')
        .filter((w) => w.length > 3);

      const matchFound = keywords.some((k) => fullText.toLowerCase().includes(k));
      if (!matchFound && keywords.length > 0) {
        findings.push({
          id: `det-diag-${idx}`,
          category: 'DIAGNOSIS',
          categoryName: 'Diagnosis',
          severity: 'HIGH',
          status: 'REVIEW_REQUIRED',
          title: `Diagnoses Omitted or Rephrased`,
          verifiedSourceText: d.value,
          generatedReportText: 'Diagnosis not distinctly matched in text.',
          whyItMatters: 'Primary diagnosis must be clearly conveyed to the patient.',
          isDeterministic: true,
        });
      }
    }
  });

  // 3. PROCEDURES
  verified.procedures.forEach((p, idx) => {
    if (p.status === 'FOUND' && p.value) {
      const keyWord = p.value.split(' ')[0].toLowerCase();
      if (keyWord.length > 3 && !fullText.toLowerCase().includes(keyWord)) {
        findings.push({
          id: `det-proc-${idx}`,
          category: 'PROCEDURES',
          categoryName: 'Procedures',
          severity: 'MEDIUM',
          status: 'REVIEW_REQUIRED',
          title: 'Procedure Detail Omitted',
          verifiedSourceText: p.value,
          generatedReportText: 'Procedure reference missing in generated summary.',
          whyItMatters: 'Patients should know key surgical or clinical procedures performed.',
          isDeterministic: true,
        });
      }
    }
  });

  // 4. MEDICATIONS (Crucial rules: check names, dosage mismatches, and invented frequencies)
  verified.medications.forEach((med, idx) => {
    const medNameLower = med.name.toLowerCase().trim();

    // Check if med name is present in report
    const isMedPresent = fullText.toLowerCase().includes(medNameLower);
    if (!isMedPresent) {
      findings.push({
        id: `det-med-omission-${idx}`,
        category: 'MEDICATIONS',
        categoryName: 'Medications',
        severity: 'CRITICAL',
        status: 'CRITICAL_ISSUE',
        title: `Medication Omitted: ${med.name}`,
        verifiedSourceText: `Medication: ${med.name} (${med.dosage})`,
        generatedReportText: 'Not mentioned in generated report',
        whyItMatters: `Verified medication ${med.name} is missing from discharge instructions. High risk of treatment failure.`,
        isDeterministic: true,
      });
      return;
    }

    // Compare the first dose attached to this medication, including its unit.
    if (med.dosage && med.dosageStatus === 'FOUND') {
      const quantity = /\d+(?:\.\d+)?\s*(?:mcg|mg|g|ml|mL|units?|iu|tablets?|capsules?)(?:\s*\/\s*\d*(?:\.\d+)?\s*(?:ml|mL|kg|h))?\b/gi;
      const expected = med.dosage.match(quantity)?.map(value => value.toLowerCase().replace(/\s/g, '')) || [];
      const allowed = [...expected, ...(med.instructions.match(quantity)?.map(value => value.toLowerCase().replace(/\s/g, '')) || [])];
      const lines = report.sections.medicationInstructions.split(/\n/).filter(line => line.toLowerCase().includes(medNameLower));
      const matchingDoses = lines.map(line => {
        const start = line.toLowerCase().indexOf(medNameLower);
        return line.slice(start).match(quantity)?.map(value => value.toLowerCase().replace(/\s/g, '')) || [];
      });
      if (!expected.length || !matchingDoses.length || matchingDoses.some(doses => expected.some((value, index) => doses[index] !== value) || doses.some(value => !allowed.includes(value)))) {
        findings.push({ id: 'det-med-dose-mismatch-' + idx, category: 'MEDICATIONS', categoryName: 'Medications', severity: 'CRITICAL', status: 'CRITICAL_ISSUE',
          title: 'Dosage Mismatch for ' + med.name, verifiedSourceText: med.name + ' ' + med.dosage,
          generatedReportText: lines.join(' '), whyItMatters: 'The medication dose and unit must match the verified source.', isDeterministic: true });
      }
    }

    for (const [key, fieldStatus] of [['frequency', med.frequencyStatus], ['duration', med.durationStatus]] as const) {
      const expected = med[key].trim().toLowerCase().replace(/\s+/g, ' ');
      const line = report.sections.medicationInstructions.split(/\n/).find(value => value.toLowerCase().includes(medNameLower)) || '';
      if (fieldStatus === 'FOUND' && expected && !line.toLowerCase().replace(/\s+/g, ' ').includes(expected)) {
        findings.push({ id: 'det-med-' + key + '-mismatch-' + idx, category: 'MEDICATIONS', categoryName: 'Medications', severity: 'CRITICAL', status: 'CRITICAL_ISSUE',
          title: 'Medication ' + key + ' differs from verified source', verifiedSourceText: med[key], generatedReportText: line,
          whyItMatters: 'Preserve the verified medication schedule; review changes against the original source.', isDeterministic: true });
      }
    }

    // Check Invented Frequency!
    // If frequency was MISSING or NOT PROVIDED in verified data:
    const freqMissing =
      !med.frequency ||
      med.frequencyStatus === 'MISSING' ||
      /not provided|missing/i.test(med.frequency);

    if (freqMissing) {
      const sentences = fullText.split(/[\n.]+/);
      const medSentence = report.sections.medicationInstructions.split(/\n/).find(s => s.toLowerCase().includes(medNameLower)) || '';

      // Check if generated sentence specifies invented frequency like "twice daily", "2 times", "every 8 hours", "3 times"
      const inventedFreqPattern = /twice|thrice|2 times|3 times|4 times|every \d+ hours|daily|morning and night|bid|tid|qid/i;
      const neutralPattern = /as directed|as prescribed|per doctor|check prescription/i;

      if (inventedFreqPattern.test(medSentence) && !neutralPattern.test(medSentence)) {
        findings.push({
          id: `det-med-invented-freq-${idx}`,
          category: 'MEDICATIONS',
          categoryName: 'Medications',
          severity: 'CRITICAL',
          status: 'CRITICAL_ISSUE',
          title: `Invented Frequency for ${med.name}`,
          verifiedSourceText: `${med.name}: Frequency NOT PROVIDED in source`,
          generatedReportText: medSentence.trim(),
          whyItMatters: `The system invented a medication frequency (${medSentence.trim()}) when none was specified in verified patient data.`,
          isDeterministic: true,
        });
      }
    }
  });

  // 5. ALLERGIES
  verified.allergies.forEach((allergy, idx) => {
    if (allergy.status === 'FOUND' && allergy.value) {
      const firstWord = allergy.value.split(' ')[0].toLowerCase();
      if (!fullText.toLowerCase().includes(firstWord)) {
        findings.push({
          id: `det-allergy-${idx}`,
          category: 'ALLERGIES',
          categoryName: 'Allergies',
          severity: 'CRITICAL',
          status: 'CRITICAL_ISSUE',
          title: `Known Allergy Omitted: ${allergy.value}`,
          verifiedSourceText: `Allergy: ${allergy.value}`,
          generatedReportText: 'Not found in generated text',
          whyItMatters: 'Known drug/food allergies must be clearly warned in discharge instructions.',
          isDeterministic: true,
        });
      }
    }
  });

  // 6. FOLLOW_UP
  verified.followUp.forEach((fu, idx) => {
    if (fu.date) {
      const cleanDate = fu.date.trim();
      const dateInText = fullText.includes(cleanDate) || isDateEquivalentPresent(cleanDate, fullText);
      if (!dateInText) {
        findings.push({
          id: `det-fu-date-${idx}`,
          category: 'FOLLOW_UP',
          categoryName: 'Follow-Up Appointments',
          severity: 'HIGH',
          status: 'REVIEW_REQUIRED',
          title: `Follow-up Date Discrepancy or Omission`,
          verifiedSourceText: `Provider: ${fu.provider}, Date: ${fu.date}`,
          generatedReportText: 'Date not explicitly found in report text',
          whyItMatters: 'Patients might miss follow-up clinical evaluations if dates are inconsistent.',
          isDeterministic: true,
        });
      }
    }
  });

  // 7. OMISSIONS
  if (
    verified.warningSigns.length > 0 &&
    !report.sections.warningSignsAndEmergency &&
    !fullText.toLowerCase().includes('warning') &&
    !fullText.toLowerCase().includes('emergency')
  ) {
    findings.push({
      id: `det-omission-warning`,
      category: 'OMISSIONS',
      categoryName: 'Omissions',
      severity: 'CRITICAL',
      status: 'CRITICAL_ISSUE',
      title: 'Warning Signs Section Omitted',
      verifiedSourceText: `${verified.warningSigns.length} verified warning signs`,
      generatedReportText: 'Warning signs section missing',
      whyItMatters: 'Critical patient red-flag safety warnings were entirely omitted.',
      isDeterministic: true,
    });
  }

  // 8. NUMERIC_VALUES
  // Cross-check numbers mentioned in verified medications vs report
  verified.medications.forEach((med, idx) => {
    if (med.dosage && med.dosageStatus === 'FOUND') {
      const match = med.dosage.match(/(\d+)\s*(mg|g|mcg|ml|tablets|capsules|units)/i);
      if (match) {
        const val = match[1];
        const unit = match[2].toLowerCase();
        // Check if report has same number with wrong unit
        const wrongUnitRegex = new RegExp(`${val}\\s*(?!${unit})(mg|g|mcg|ml|tablets|capsules|units)`, 'i');
        if (wrongUnitRegex.test(fullText)) {
          findings.push({
            id: `det-num-unit-${idx}`,
            category: 'NUMERIC_VALUES',
            categoryName: 'Numeric Values',
            severity: 'CRITICAL',
            status: 'CRITICAL_ISSUE',
            title: `Unit Mismatch for ${med.name}`,
            verifiedSourceText: `Verified: ${med.dosage}`,
            generatedReportText: `Conflicting dosage unit found in text`,
            whyItMatters: 'Unit confusion (e.g. mg vs mcg) leads to severe medical overdose or underdose.',
            isDeterministic: true,
          });
        }
      }
    }
  });

  // 9. DATES
  // Compare verified follow up date vs any date in generated text
  verified.followUp.forEach((fu, idx) => {
    if (fu.date) {
      const verDateObj = new Date(fu.date);
      if (!isNaN(verDateObj.getTime())) {
        // Extract all YYYY-MM-DD or Month DD, YYYY in report
        const datesInReport = fullText.match(/\b\d{4}-\d{2}-\d{2}\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/gi) || [];
        if (datesInReport.length > 0) {
          const hasExact = datesInReport.some((d) => {
            const repDateObj = new Date(d);
            return !isNaN(repDateObj.getTime()) && repDateObj.getTime() === verDateObj.getTime();
          });
          if (!hasExact && datesInReport.length > 0) {
            findings.push({
              id: `det-date-mismatch-${idx}`,
              category: 'DATES',
              categoryName: 'Dates Validation',
              severity: 'CRITICAL',
              status: 'CRITICAL_ISSUE',
              title: `Follow-up Date Mismatch`,
              verifiedSourceText: `Verified Date: ${fu.date}`,
              generatedReportText: `Report contains date: ${datesInReport.join(', ')}`,
              whyItMatters: 'Follow-up appointment date in generated report differs from verified date.',
              isDeterministic: true,
            });
          }
        }
      }
    }
  });

  return findings;
}

function extractNumbers(str: string): string[] {
  const matches = str.match(/\d+(?:\.\d+)?/g);
  return matches || [];
}

function isDateEquivalentPresent(dateStr: string, fullText: string): boolean {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const month = monthNames[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();

    const formatted1 = `${month} ${day}, ${year}`;
    const formatted2 = `${day} ${month} ${year}`;
    const formatted3 = `${month} ${day}`;

    return (
      fullText.includes(formatted1) ||
      fullText.includes(formatted2) ||
      fullText.includes(formatted3)
    );
  } catch {
    return false;
  }
}
