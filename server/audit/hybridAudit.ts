import {
  AuthoritativeDischargeData,
  GeneratedReport,
  AuditResult,
  AuditFinding,
  AuditCategory,
  AuditCategoryStatus,
  AuditRecommendation,
} from '../../src/types/discharge';
import { AUDIT_POLICY_VERSION, runDeterministicAudit } from './deterministicAudit';
import { runSemanticAudit } from './semanticAudit';

export const ALL_18_AUDIT_CATEGORIES: AuditCategory[] = [
  'PATIENT_INFORMATION',
  'DIAGNOSIS',
  'PROCEDURES',
  'MEDICATIONS',
  'ALLERGIES',
  'FOLLOW_UP',
  'OMISSIONS',
  'NUMERIC_VALUES',
  'DATES',
  'DIET',
  'ACTIVITY_RESTRICTIONS',
  'WOUND_PROCEDURE_CARE',
  'WARNING_SIGNS',
  'EMERGENCY_INSTRUCTIONS',
  'UNSUPPORTED_CLAIMS',
  'CONTRADICTIONS',
  'MEDICAL_MEANING',
  'WORDING',
];

export async function executeHybridAudit(
  verified: AuthoritativeDischargeData,
  report: GeneratedReport
): Promise<AuditResult> {
  const deterministicFindings = runDeterministicAudit(verified, report);
  const semanticFindings = await runSemanticAudit(verified, report);

  const allFindings: AuditFinding[] = [...deterministicFindings, ...semanticFindings];

  const categorySummaries: Record<AuditCategory, { status: AuditCategoryStatus; issueCount: number }> =
    ALL_18_AUDIT_CATEGORIES.reduce((acc, cat) => {
      acc[cat] = { status: 'PASS', issueCount: 0 };
      return acc;
    }, {} as Record<AuditCategory, { status: AuditCategoryStatus; issueCount: number }>);

  const cloudAuditStatus = process.env.GEMINI_AUDIT_ENABLED !== 'true' ? 'disabled' : semanticFindings.some(f => f.id === 'cloud-audit-unavailable') ? 'unavailable' : 'completed';
  const localCategories = ['PATIENT_INFORMATION', 'DIAGNOSIS', 'PROCEDURES', 'MEDICATIONS', 'ALLERGIES', 'FOLLOW_UP', 'OMISSIONS', 'NUMERIC_VALUES', 'DATES', 'DIET', 'ACTIVITY_RESTRICTIONS', 'MEDICAL_MEANING'];
  for (const category of ALL_18_AUDIT_CATEGORIES) {
    if (!localCategories.includes(category)) categorySummaries[category].status = 'NOT_EVALUATED';
  }
  const coverageNote = 'Local checks cover specific patterns, not complete clinical meaning. NOT_EVALUATED categories require explicit clinician review. A passing rule is not a clinical safety guarantee.';
  // Group findings into categories
  allFindings.forEach((finding) => {
    const current = categorySummaries[finding.category];
    if (current) {
      current.issueCount += 1;
      if (
        finding.status === 'CRITICAL_ISSUE' ||
        current.status === 'CRITICAL_ISSUE'
      ) {
        current.status = 'CRITICAL_ISSUE';
      } else if (
        finding.status === 'REVIEW_REQUIRED' ||
        current.status === 'REVIEW_REQUIRED'
      ) {
        current.status = 'REVIEW_REQUIRED';
      }
    }
  });

  // Calculate Overall Audit Status & Recommendation
  const hasCritical = allFindings.some(
    (f) => f.status === 'CRITICAL_ISSUE' || f.severity === 'CRITICAL'
  );
  const hasReviewRequired = Object.values(categorySummaries).some(category => category.status === 'NOT_EVALUATED') || allFindings.some(
    (f) => f.status === 'REVIEW_REQUIRED' || f.severity === 'HIGH' || f.severity === 'MEDIUM'
  );

  let overallStatus: AuditCategoryStatus = 'PASS';
  let recommendation: AuditRecommendation = 'READY_FOR_HUMAN_APPROVAL';

  if (hasCritical) {
    overallStatus = 'CRITICAL_ISSUE';
    recommendation = 'DO_NOT_APPROVE';
  } else if (hasReviewRequired) {
    overallStatus = 'REVIEW_REQUIRED';
    recommendation = 'REVIEW_REQUIRED';
  }

  const auditId = `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const summary = hasCritical
    ? `CRITICAL AUDIT FAILURE: Found ${
        allFindings.filter((f) => f.status === 'CRITICAL_ISSUE').length
      } critical mismatch(es). Approval is strictly blocked until issues are corrected.`
    : hasReviewRequired
    ? `Clinician review required: ${allFindings.length} finding(s); categories not evaluated by automation must be reviewed manually.`
    : `No issues detected by the checks performed. Clinician review is still required.`;

  const categoryStatus = ALL_18_AUDIT_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = categorySummaries[cat]?.status || 'PASS';
    return acc;
  }, {} as Record<AuditCategory, AuditCategoryStatus>);

  const criticalCount = allFindings.filter((f) => f.status === 'CRITICAL_ISSUE').length;
  const warningCount = allFindings.filter((f) => f.status === 'REVIEW_REQUIRED').length;
  const passCount = Object.values(categorySummaries).filter(category => category.status === 'PASS').length;

  return {
    policyVersion: AUDIT_POLICY_VERSION,
    cloudAuditStatus,
    coverageNote,
    auditId,
    reportVersion: report.version,
    auditedAt: new Date().toISOString(),
    overallStatus,
    recommendation,
    approvalRecommendation: recommendation,
    criticalCount,
    warningCount,
    passCount,
    findings: allFindings,
    categorySummaries,
    categoryStatus,
    summary,
  };
}
