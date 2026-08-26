import {
  AuthoritativeDischargeData,
  GeneratedReport,
  AuditFinding,
} from '../../src/types/discharge';
import { runSemanticAuditAi } from '../ai/geminiService';

export async function runSemanticAudit(
  verified: AuthoritativeDischargeData,
  report: GeneratedReport
): Promise<AuditFinding[]> {
  const fullText = Object.values(report.sections).join(' \n ');
  const fallbackFindings: AuditFinding[] = [];

  // 11. ACTIVITY_RESTRICTIONS & 17. MEDICAL_MEANING Meaning Reversal check
  verified.activityRestrictions.forEach((act, idx) => {
    const val = act.value.toLowerCase();
    if (val.includes('no driving') || val.includes('avoid driving') || val.includes('do not drive')) {
      if (
        fullText.toLowerCase().includes('you may drive') ||
        fullText.toLowerCase().includes('resume driving immediately') ||
        fullText.toLowerCase().includes('driving is allowed')
      ) {
        fallbackFindings.push({
          id: `sem-meaning-reversal-drive-${idx}`,
          category: 'MEDICAL_MEANING',
          categoryName: 'Medical Meaning Integrity',
          severity: 'CRITICAL',
          status: 'CRITICAL_ISSUE',
          title: 'Critical Meaning Reversal (Driving)',
          verifiedSourceText: act.value,
          generatedReportText: 'Report permits driving immediately',
          whyItMatters: 'Direct reversal of medical restriction on driving increases trauma/collision risk.',
          isDeterministic: true,
        });
      }
    }

    if (val.includes('no heavy exercise') || val.includes('avoid heavy exercise') || val.includes('no lifting >')) {
      if (
        fullText.toLowerCase().includes('resume heavy exercise') ||
        fullText.toLowerCase().includes('you can perform strenuous exercise') ||
        fullText.toLowerCase().includes('lift heavy weights')
      ) {
        fallbackFindings.push({
          id: `sem-meaning-reversal-ex-${idx}`,
          category: 'ACTIVITY_RESTRICTIONS',
          categoryName: 'Activity Restrictions',
          severity: 'CRITICAL',
          status: 'CRITICAL_ISSUE',
          title: 'Critical Meaning Reversal (Exercise/Lifting)',
          verifiedSourceText: act.value,
          generatedReportText: 'Report encourages heavy exercise',
          whyItMatters: 'Reversing activity limits risks post-operative wound dehiscence or cardiac strain.',
          isDeterministic: true,
        });
      }
    }
  });

  // 10. DIET & 15. UNSUPPORTED_CLAIMS: Check if verified is "Light diet" or "Low sodium", but report added unmentioned restrictive diet like "Low sodium" or "Keto" when not in verified
  if (verified.diet.length > 0) {
    const verifiedDietText = verified.diet.map((d) => d.value.toLowerCase()).join(' ');
    if (
      !verifiedDietText.includes('low sodium') &&
      !verifiedDietText.includes('salt') &&
      fullText.toLowerCase().includes('low-sodium diet')
    ) {
      fallbackFindings.push({
        id: `sem-unsupported-diet`,
        category: 'DIET',
        categoryName: 'Dietary Instructions',
        severity: 'HIGH',
        status: 'REVIEW_REQUIRED',
        title: 'Unsupported Dietary Restriction Added',
        verifiedSourceText: verified.diet.map((d) => d.value).join('; ') || 'General diet',
        generatedReportText: 'Recommends strict low-sodium diet',
        whyItMatters: 'Low sodium restriction was added without explicit clinician directive.',
        isDeterministic: false,
      });
    }
  }

  // AI Semantic Layer Execution with 2.5s timeout for fast execution
  let aiFindings: AuditFinding[] = [];
  try {
    const aiPromise = runSemanticAuditAi(verified, report);
    const timeoutPromise = new Promise<AuditFinding[]>((resolve) =>
      setTimeout(() => resolve([]), 2500)
    );
    aiFindings = await Promise.race([aiPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Semantic AI audit failed or offline, relying on rule-based semantic safety checks.');
  }

  // Merge findings, avoiding duplicate titles
  const allFindings = [...fallbackFindings];
  for (const aiItem of aiFindings) {
    if (!allFindings.some((existing) => existing.category === aiItem.category && existing.title === aiItem.title)) {
      allFindings.push(aiItem);
    }
  }

  return allFindings;
}
