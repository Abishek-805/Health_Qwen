# Audit progress and recovery

Baseline: `main` at `374b2d4a42536e2c6b56ec3e50de897a0fb87503`, 20 October 2026. Windows / Node 24.19.0 / npm 11.17.0. The existing untracked system-design document was retained in architecture.md with a compatibility pointer.

## Completed phase

Engineering review, evidence-based remediation, synthetic evaluation and final local verification are complete. Publication is authorized by the user's earlier explicit GitHub push request. The handoff supplies the eventual published SHA and actual remote CI outcome; neither is invented in this pre-publication log.

## Implemented

- Preserved the single-clinician localhost architecture, local Qwen extraction, English templates, optional cloud gates, authentication, SQLite history and saved-record approval/PDF boundaries.
- Fixed uncertainty promotion and malformed certainty; medication-local evidence, conflicting allergy/meta-instruction evidence, missing schedule/allergy assumptions, repeated medication mismatches and omitted warnings.
- Preserved all eight report sections in PDF, corrected the date label and long-field pagination; added direct renderer approval/version/policy gates.
- Made approval replay idempotent. Current audit policy is `2026-10-20.4`; historical records require a fresh save/audit/review, without rewriting history.
- Added dirty source/report navigation protection, new-document session reset, source excerpts, independently preserved appointment statuses and free-form dates, empty appointment defaults, and honest download-request feedback.
- Preserved additional notes through canonical normalization/evidence/mapping. One explicit prompt schema change is versioned `local-extraction-v2-additional-notes`; the real model still omitted the dedicated notes case.
- Fixed microgram glyph normalization and confirmed development static-file exposure, with synthetic direct/encoded/@fs regressions protecting runtime/data/models and database files.
- Added a frozen 31-case synthetic corpus, measured evaluation/scoring, labelled pipeline cases, clinician review template and formal documentation. No dependencies added or versions changed.

## Actual final verification

- TypeScript, 30 node:test cases, 18 PDF checks and architecture checks PASS.
- Actual pinned Qwen/Vulkan model/OCR suite 8/8 PASS; final-prompt service integration 18/18 PASS.
- Final actual model benchmark 31/31 completed, zero execution errors. Final evidence replay: value-only agreement 199/237 (83.97%); exact value/status 94/237 (39.66%); 30 missing predicted fields. These are synthetic agreement proxies, not clinically adjudicated accuracy.
- Labelled pipeline 9/9 blocking verdicts, critical-category precision/recall 1 on selected cases; eight PDF section markers. One clean rendered OCR fixture CER/WER 0, 2,616 ms.
- Final build, real production start and development middleware smoke PASS, including auth/origin, private-file rejection, generation/save/approval/native-form PDF and restart persistence.
- Windows lifecycle PASS. Final managed application restart is part of publication verification; see handoff.
- Isolated lockfile installation PASS for 378 packages with lifecycle scripts disabled. Existing native runtime exercised separately. The ignored isolated dependency folder may remain; it contains no application records.
- Dependency advisory scan: zero known advisories at execution time.
- Browser interaction PARTIAL: synthetic saved record/reviewer loaded; dirty report blocked approval and triggered discard confirmation. Dialog/focus automation then stalled. Full browser source-edit/new-session/download completion and formal accessibility remain unverified.
- No live clinical cloud traffic, real clinical data evaluation, clinical endorsement, exhaustive native-file sandbox or peak-memory/leak measurement.

## Evidence and files

The detailed review, dispositions, roadmap and matrix are in this directory. Public synthetic metrics are in evaluation-results.json; raw synthetic predictions, logs and temporary test databases remain excluded from Git. New tests/evaluator are in server/tests and server/evaluation. Operational, API, architecture, privacy, evaluation and formal project guides are under docs.

## Continuation

1. Complete artifact/link/fingerprint/secret-exclusion checks, restart the managed application and verify public health only.
2. Commit and push the reviewed source/docs/tests under existing authorization; inspect actual GitHub CI and supply its URL/status in the handoff.
3. Obtain qualified independent review of frozen labels and residual model errors, agree clinical acceptance criteria and conduct a hold-out study. Do not tune labels to improve scores.
4. Repeat full browser source-edit/discard/new-session/approval/download and accessibility checks with working interactive dialog control.

Clinical readiness is not established. Do not substitute passing engineering tests for qualified review of the original source and every generated instruction.
