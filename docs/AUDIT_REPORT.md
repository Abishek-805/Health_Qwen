# Project audit report

Audit date: 20 October 2026 (Asia/Kolkata). Repository: Abishek-805/Health_Qwen. Baseline commit: b6d79bd. Scope: tracked source, configuration, dependency lock, API boundaries, clinical workflow, storage, OCR/model services, PDF delivery, Windows lifecycle, documentation, and build/runtime checks.

## Assessment

The project runs as a local demonstration and passes the exercised functional checks. It is not ready for patient-facing or shared clinical deployment. Authentication, trustworthy approval enforcement, durable storage, clinical validation, and dependency remediation remain required. Passing tests establish the tested examples, not clinical correctness or regulatory compliance.

This audit is a code and local execution review, not a penetration test, model certification, or legal/compliance assessment. The existing local .env was preserved and not printed. Real patient data was not intentionally submitted. Cloud model access was not validated.

## Architecture and data flow

React implements a six-step upload, verification, generation, audit, review, and approval flow. Express owns /api and mounts Vite middleware in development or dist static assets in production. Uploaded files stay in memory for parsing; images can also be written into OS temporary storage by the Python OCR fallback. Extraction uses Qwen through node-llama-cpp; evidence validation is heuristic. English report generation is template based. The audit combines deterministic checks and local semantic heuristics, with optional Gemini findings. Documents, patient indexes, and settings are process-local arrays/objects. PDF rendering is server side via jsPDF.

Strengths: separate service/repository/route layers; explicit source evidence fields; a 15 MB upload limit; OCR quality gating on the extraction route; report/audit version checks; critical audit blocking in the standard approval flow; PDF content and HTTP attachment tests; ignored environment/model files.

## Findings and remediation

Severity here reflects application impact; dependency severities below are npm's classifications. Locations name the relevant implementation for reproducibility.

| ID | Severity | Evidence and impact | Required remediation |
| --- | --- | --- | --- |
| A01 | Critical | server.ts binds 0.0.0.0. server/routes/api.ts exposes documents, patients, settings, edits, and approval without authentication or authorization. Any reachable client can read or modify records and claim a clinician identity. | Authenticate users, enforce server-side roles and record access, derive reviewer identity from the session, and isolate network access until implemented. |
| A02 | Critical | handleCreateDocument accepts approvalStatus, approvedBy, generatedReport, and auditResult. handleUpdateDocument forwards req.body into a repository object merge. resolvePdfDocument accepts a full client-supplied document; validateApprovedPdfDocument trusts its audit/approval fields. Existing fixture tests generate accepted PDFs by POSTing such documents without authenticated review. | Restrict mutable fields; store trusted versioned artifacts; resolve PDF requests by ID; enforce server-owned audit/approval transitions and reviewer identity. Reject crafted approval/audit metadata. |
| A03 | High | documentRepository.ts stores records/settings only in memory. Restarts, crashes, and tsx watch reloads clear everything. There are no backups, migrations, retention controls, or append-only approval records. | Add durable transactional storage, backup/restore checks, retention rules, and immutable approval history before operational use. The new launcher avoids backend watch reloads but does not solve persistence. |
| A04 | High | documentSourceService.ts logs the first 500 extracted characters; localClinicalExtractionService.ts logs the first 300 response characters; PDF endpoint logs patient-derived filenames. Python OCR removes temp files only after successful execSync, leaving image/script files when Python fails. | Remove clinical content from logs, redact identifiers/errors, use controlled retention, and move all temp-file cleanup into finally blocks. Treat existing logs and temporary files as potentially sensitive. |
| A05 | High | deterministicAudit.ts uses substring/keyword checks. Dose comparison accepts any matching number in a medication sentence rather than verifying the dose and unit together. sourceEvidenceValidator.ts accepts evidence OR value OR 75% token overlap; this can mark an unsupported value FOUND when its evidence matches elsewhere. | Add adversarial tests for doses, units, negation, contradictory evidence, and cross-field contamination. Validate typed clinical facts in context. Obtain clinician-reviewed evaluation datasets and measured error rates. |
| A06 | High | semanticAudit.ts races AI against 2.5 seconds and returns local findings on timeout; geminiService.ts returns [] on missing key/failure. hybridAudit.ts initializes all 18 categories to PASS, even though a missing/failed semantic check is not proof of coverage. | Record which checks ran and distinguish not evaluated/unavailable from PASS. Define whether unavailable required checks block approval. Cancel timed-out requests. |
| A07 | High | Routes accept broad JSON objects with limited shape checks and TypeScript casts. Uploads trust supplied MIME metadata; memory uploads, 25 MB JSON bodies, OCR, and inference have no request rate limit, concurrency budget, or complete cancellation boundary. | Validate schemas and file signatures at the API boundary; cap resource use, pages, concurrency, duration, and request rates. Return sanitized consistent errors. |
| A08 | High | Optional generation/audit and section regeneration send clinical content to Google. regenerateSectionAi is not gated by GEMINI_GENERATION_ENABLED. /api/ai-status makes a cloud request when configured. | Make cloud processing explicit per operation, validate configuration, document data processing/retention requirements, and enforce a coherent opt-in policy before sensitive use. |
| A09 | Medium | hybridAudit.ts computes passCount as 18 minus a boolean for critical findings and a boolean for review findings, rather than counting passing categories. Many failed categories can still display 16 passes. | Derive counts from categorySummaries and add multi-category regression cases. |
| A10 | Medium | documentRepository.createDocument increments patient.documentCount when replacing an existing ID. updateDocument can change identity fields without rebuilding patient indexes, and does not refresh updatedAt itself. | Preserve IDs, update indexes consistently, derive counts from records, and set server timestamps. Test replacement and patient reassignment. |
| A11 | Medium | PatientsPage.tsx always injects sample patients. App.tsx supplies demo clinician/hospital identity. SettingsPage.tsx reports saved status while only changing React state and does not persist through /api/settings. | Label/remove demo data and identities, wire settings to a durable backend, and distinguish unsaved session edits. |
| A12 | Medium | download-model.ts downloads from a mutable main URL and considers a sufficiently large file complete without a hash. Redirect depth, network timeout, and partial-download handling are incomplete. | Pin model revision and checksum, download to a temporary path, bound time/redirects, then atomically publish verified weights. |
| A13 | Medium | localClinicalExtractionService.ts treats any truthy llama.gpu as CUDA. This audit observed gpu=vulkan while logs reported CUDA. Shared cached model initialization/inference does not demonstrate a tested concurrent-request policy. | Report the actual backend; serialize or bound inference and test concurrent initialization/resource exhaustion on supported hardware. |
| A14 | Medium | npm test runs seven top-level cases, not every server/tests script. Some tests require a local 1.12 GB model, native runtime, OCR assets, and optional Python. There is no checked-in CI workflow, Dockerfile, or production deployment configuration. | Separate deterministic checks from hardware benchmarks; add repeatable CI and runtime smoke tests. Keep setup documentation aligned with real coverage. |
| A15 | Low | Build emits a frontend JavaScript chunk over 500 kB (about 714 kB in this run). TypeScript checking is called lint, without a style/accessibility linter. Several form labels lack explicit input association in SettingsPage.tsx. | Measure loading cost before splitting bundles; audit keyboard focus, label associations, contrast, and screen-reader flow with browser testing. |

## Dependency audit snapshot

`npm audit --json` reported **10 affected package entries: 3 critical, 3 high, 3 moderate, 1 low**. Raw output: [dependency-audit.json](dependency-audit.json). These are package-level findings, including transitive propagation; they are not ten demonstrated exploits in this app. Exploitability depends on reachability and package usage. No dependency remediation was applied in this change.

| Package | Reported severity | npm fix indication |
| --- | --- | --- |
| @simple-git/argv-parser | Critical | Suggested node-llama-cpp major-version change |
| proxy-addr | Critical | Fix available |
| simple-git | Critical | Suggested node-llama-cpp major-version change |
| multer | High | Fix available |
| node-llama-cpp | High | Suggested downgrade to 2.0.0; requires deliberate compatibility review |
| source-map-js | High | Fix available |
| body-parser | Moderate | Fix available |
| express | Moderate | Fix available |
| qs | Moderate | Fix available |
| dompurify | Low | Fix available |

The upload-facing multer finding is relevant to reachable multipart routes; see the [reviewed crafted-field denial-of-service advisory](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm). The simple-git findings involve unsafe Git invocation paths; route-level exploitation was not established; see the [reviewed trailer-command advisory](https://github.com/advisories/GHSA-x6jw-m9v5-85vh). Both pages were checked during this audit. Evaluate all advisory records and installed dependency paths before choosing upgrades. Do not apply npm audit fix --force blindly: the suggested node-llama-cpp downgrade can break native/model APIs.

## Changes delivered

- Added root start.bat and stop.bat with a shared PowerShell helper, per-checkout process identity and start time, duplicate-start protection, serialized lifecycle operations, hidden background execution, logs, and stale-PID protection. Stop targets only the recorded process tree. It is a force stop; memory records are lost.
- Added a Windows regression script for start/health/duplicate start/stop/repeated stop/stale identity. Runtime lock/log/state files are ignored by Git and Vite watching.
- Moved scratch TypeScript tools to scripts/diagnostics, updating imports and usage paths; moved screenshots to docs/screenshots and the historical cleanup manifest to docs. No diagnostic files were discarded.
- Kept source/config entry points and existing OCR data in place. Removed the second, obsolete bun.lock; npm package-lock.json remains authoritative. Renamed the placeholder npm package consistently in both manifests.
- Rewrote README and .env.example to describe the actual local/cloud behavior, model requirement, correct endpoints, environment controls, storage limits, commands, and troubleshooting. Existing .env and model weights were preserved.
- Fixed a reproduced production startup failure: CommonJS output attempted to require the ESM node-llama-cpp graph and threw ERR_REQUIRE_ASYNC_MODULE. Build/start now use dist/server.js as ESM.

## Verification

Host: Windows, Node 24.19.0, npm 11.17.0, existing installed dependencies, existing local model (1,117,320,736 bytes). A fresh npm ci was not performed, so reproducibility on a clean machine remains unverified.

| Check | Result |
| --- | --- |
| npm run lint | Passed TypeScript checking, including relocated diagnostics |
| npm run build | Passed; large frontend chunk warning remains |
| npm test | 7/7 passed, including Qwen extraction and image OCR benchmark |
| PDF endpoint suite | 18 passed, 0 failed; binary content and HTTP delivery checked |
| Step 6 architecture regression | Passed |
| UI integration acceptance script | 18/18 passed; service-level script, not browser automation |
| Windows lifecycle regression | Passed: start, health, duplicate start, stop, repeated stop, stale PID protection |
| Production runtime | Original server.cjs failed; updated server.js served /api/health and / with HTTP 200 on port 3302 |
| npm audit | Completed; exit failure expected because vulnerabilities remain |
| Git diff whitespace validation | Passed |

PaddleOCR was absent; tests printed ModuleNotFoundError and successfully used Tesseract. GPU logs identified Vulkan under a CUDA label (A13). Full browser interaction, accessibility, malicious-upload stress tests, multi-user concurrency, fresh model download, Gemini connectivity, clinical accuracy across representative populations, and backup/restore were not verified.

## Recommended order of work

1. Restrict access immediately and use synthetic data. Remove clinical log content and ensure temporary-file cleanup.
2. Implement trusted authentication, server-owned document/audit/approval transitions, schema validation, and durable storage together; test bypass attempts and restart recovery.
3. Remediate dependencies with targeted compatible upgrades and rerun native extraction, OCR, upload, PDF, and production checks.
4. Strengthen clinical checks and distinguish unavailable checks from passing checks; add clinician-reviewed adversarial benchmarks.
5. Fix patient/settings consistency, model verification, resource limits, and telemetry; add repeatable CI and browser accessibility testing.

The organizational and launcher work does not remediate A01-A15. The production module-format defect is fixed; the remaining findings are an explicit backlog.
