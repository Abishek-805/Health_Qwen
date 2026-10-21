# Apply Fix and Re-audit follow-up

21 October 2026. The reported medication-context modal showed repeated medication names and schedules after attempted fixes.

## Cause and correction

The old Step 4 handler appended a finding's source string to the existing section, preview-audited it, then saved regardless of whether that finding cleared. Appending a drug name did not remove contradictory doses, stopped-medication wording or repeated lines; repeated clicks could make the report worse. Some categories also targeted the wrong section, including warning omissions and allergies.

The new authenticated repair endpoint accepts only the saved document ID, expected report version and finding ID. It loads the current saved source/report/audit rather than trusting replacement source text from the browser. A local template rebuild replaces only the affected supported section; unrelated sections and report identity/version are retained, except that a patient-identity repair deliberately corrects identity metadata. No Qwen extraction or cloud rewrite is needed. The audit itself still follows the configured local/optional-cloud policy.

The selected finding must disappear on re-audit, matched by category/title/source rather than a newly generated ID. Otherwise the endpoint returns 422 and saves nothing. Unsupported/manual findings also receive explicit review guidance. Successful previews go through the existing versioned save, so the backend assigns the new version, recomputes the authoritative audit and clears approval. The UI waits for that save, shows errors without claiming success, and displays a success notice only afterward.

## Important source-data case

The screenshot is also consistent with duplicate verified rows: one drug-name field contains a full dose/schedule while another contains the bare drug name. A fresh report built from such rows can still legitimately trigger medication-context findings. The repair must not silently guess which verified row to discard or suppress a blocking audit.

The modal now provides Edit verified source (Step 2). Compare possible duplicate rows, full-schedule names and stopped/conflicting instructions with the original document; correct/remove unsupported entries, confirm, then generate and save again. This is a human source correction, not automatic clinical adjudication. Existing records are not rewritten automatically on application restart.

## Verification

- 42 fast regressions passed; new cases cover conflicting/negated report repair, repeated-click append artifacts, preservation of unrelated reviewed text and input immutability, refusal of duplicate verified medication rows, correct warning-section restoration and patient metadata repair.
- 18 PDF checks and approved-PDF architecture regression passed.
- TypeScript and production build passed.
- Production and development smoke passed through actual HTTP: saved report damage, stale repair rejection, preview re-audit, proof the preview did not persist, versioned repair save, cleared approval, fresh audit, approval, native-form PDF and persisted approval after restart.

The application's deterministic audit rules and clinical model were not weakened or retuned. No real patient record or credential contents were read for this fix. Manual browser click verification and native model/clinical evaluation were not rerun; the saved-record HTTP path and repair logic were exercised with synthetic fixtures.
