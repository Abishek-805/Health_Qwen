# Apply Fix and Re-audit follow-up

21 October 2026. The reported medication-context modal showed repeated medication names and schedules after attempted fixes.

## Cause and correction

The old Step 4 handler appended a finding's source string to the existing section, preview-audited it, then saved regardless of whether that finding cleared. Appending a drug name did not remove contradictory doses, stopped-medication wording or repeated lines; repeated clicks could make the report worse. Some categories also targeted the wrong section, including warning omissions and allergies.

The new authenticated repair endpoint accepts only the saved document ID, expected report version and finding ID. It loads the current saved source/report/audit rather than trusting replacement source text from the browser. A local template rebuild replaces only the affected supported section; unrelated sections and report identity/version are retained, except that a patient-identity repair deliberately corrects identity metadata. No Qwen extraction or cloud rewrite is needed. The audit itself still follows the configured local/optional-cloud policy.

The selected finding must disappear on re-audit, matched by category/title/source rather than a newly generated ID. Otherwise the endpoint returns 422 and saves nothing. Unsupported/manual findings also receive explicit review guidance. Successful previews go through the existing versioned save, so the backend assigns the new version, recomputes the authoritative audit and clears approval. The UI waits for that save, shows errors without claiming success, and displays a success notice only afterward.

## Important source-data case

The screenshot is consistent with duplicate verified rows: one drug-name field contains a full dose/schedule while another contains the bare drug name. A fresh report built from such rows can still trigger medication-context findings.

The follow-up now removes exact duplicates or schedule-as-name echoes when their structured dose, frequency, duration, instructions and statuses agree. An exact repeated duration such as `3 days. for 3 days` on a matching schedule-name echo is recognized too. The bare-name row is retained unchanged. Conflicting doses, frequencies, durations, instructions, uncertain statuses and combination names are not merged. Remaining critical medication findings reject the entire preview. The returned corrected source and report are saved together through the normal versioned PUT, and Step 2 state is refreshed only after save success. A success notice identifies the number of removed duplicates. Existing records change only when the user clicks repair; restart does not rewrite them. Clinician approval remains required.

## Verification

- Fast regressions cover conflicting/negated report repair, matching duplicate removal, screenshot repeated-duration echoes, conflicting-source refusal, ordering, idempotence, preservation of unrelated reviewed text and input immutability, correct warning-section restoration and patient metadata repair.
- 18 PDF checks and approved-PDF architecture regression passed.
- TypeScript and production build passed.
- Production and development HTTP smoke exercise saved duplicate source plus damaged report, stale repair rejection, preview re-audit, proof the preview did not persist, versioned source/report repair save, cleared approval, fresh audit, approval, native-form PDF and persisted source/approval after restart.

The application's deterministic audit rules and clinical model were not weakened or retuned. No real patient record or credential contents were read for this fix. Manual browser click verification and native model/clinical evaluation were not rerun; the saved-record HTTP path and repair logic were exercised with synthetic fixtures.
