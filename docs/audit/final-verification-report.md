# Final engineering verification

> Audit snapshot from commit aa63a40. The subsequent Qwen schema/status and verification-control investigation is recorded in [the follow-up report](qwen-schema-fix.md). Previous model scores below describe prompt v2, not the revised v7 two-read protocol.

Date: 20 October 2026. Starting branch/commit: `main`, `374b2d4a42536e2c6b56ec3e50de897a0fb87503`. Initially the only untracked file was the prior system-design document; its content was retained in `docs/architecture.md` with the original path now pointing there. Tests below used synthetic fixtures, isolated databases and disabled clinical cloud processing.

## Outcome

Confirmed software defects were reproduced and remediated with targeted checks. The local single-clinician architecture, local extraction/English templates, authenticated saved-record approval, SQLite history, native PDF download and Windows ownership controls were retained. No dependency/model substitution or prompt score-tuning was performed. No actual clinical records, secret values or private backups are included in the deliverables.

**Clinical readiness is not established.** The final real-model benchmark completed with many normalized fields held UNCLEAR; schema-fallback and explicit-uncertainty causes were not separately quantified. Strict value agreement is 199/237, and exact value/status agreement is 94/237. Substantive omissions and typed extraction errors remain. No clinician reviewed or endorsed the labels/results.

## Executed checks

| Check | Result | Actual evidence and limits |
| --- | --- | --- |
| TypeScript | PASS | Final `npm run lint`, exit 0 |
| Fast security, validation, persistence/concurrency, clinical and scorer tests | PASS | Final `npm test`: 30 node:test tests; includes hostile origin/host, forged metadata, simultaneous same-version writes, stale edits, approval replay, legacy audit policy, recovery and uncertainty regressions |
| PDF endpoint/content | PASS | 18 existing checks; native URL-encoded form response, signature/MIME/filename/content, saved approval/critical gates |
| PDF preservation/pagination | PASS | All eight report-section markers; direct renderer stale/unapproved/policy checks; six long clinical fields checked with extracted page coordinates after an initial failing reproduction |
| Model/OCR suite | PASS | `npm run test:model`, 8/8; pinned checksum, actual Vulkan, OCR/quality checks and token-budget rejection; not a clinical accuracy result |
| Service integration | PASS | 18/18 service criteria with the final versioned prompt; these are not full browser tests |
| Real local-model evaluation | COMPLETED; clinical gate not met | 31/31, no execution errors; final strict schema handling; fixed author-labelled synthetic data |
| Labelled pipeline evaluation | PASS on selected cases | Nine blocking verdicts; critical-category precision/recall 1 on that constructed set; eight PDF section markers; audit policy `2026-10-20.4` |
| OCR ground-truth measurement | COMPLETED | One clean rendered synthetic image: CER=0, WER=0, 2,616 ms, Tesseract; not representative OCR validation |
| Development private-file serving | PASS | Synthetic probes in runtime/data/models return 403 for direct, encoded and /@fs paths; auth/save/approval/PDF/restart also pass. No actual private files requested. |
| Production build/start | PASS | Final build and real `npm start`, hashed static assets despite a development shell, UI auth, origin checks, generation/save/approval, native form PDF, persistence across restart |
| Windows lifecycle | PASS | Start, HTTP readiness, configured URL dispatch, duplicate reopen without new PID, stop/repeated stop, stale PID protection; real managed app restarted successfully after final changes |
| Isolated clean lockfile install | PASS, scoped | 378 packages installed with `npm ci --ignore-scripts --no-audit`; installation scripts/native setup deliberately excluded; existing native runtime separately exercised |
| Dependency advisory scan | PASS snapshot | Final `npm audit --json`, exit 0, zero known advisories; snapshot in `docs/dependency-audit.json`; not a vulnerability-free guarantee |
| Browser interaction | PARTIAL | Loaded saved synthetic record and reviewer; edited report, observed approval disabled and discard confirm. Automation then returned focus timeouts; later transitions could not be verified. Synthetic dashboard screenshot retained; screenshot alone is not behavior proof |
| Formal accessibility | NOT RUN | No WCAG, full keyboard/focus or screen-reader compliance claim |
| Live Gemini | NOT RUN by design | Disabled-cloud intercepted test observes zero fetch calls; no real clinical cloud traffic or billing experiment |
| Linux/macOS native/hardware behavior | NOT RUN locally | Windows/Vulkan actual evidence only; CI workflow is portable but remote results are not asserted in this pre-publication report |
| Remote CI | NOT RUN when this report was written | Workflow now includes deterministic clinical/pipeline and production smoke checks; publication/handoff records the actual GitHub outcome separately |

Machine-readable benchmark evidence is in [evaluation-results.json](evaluation-results.json). Raw synthetic predictions and detailed execution logs are retained only in ignored `.runtime` files. Latencies and hardware fingerprints identify observed runs, not performance guarantees or complete resource profiling.

## Reproductions and verification history

- The first new clinical suite passed 1/10, failing nine actual invariants; fixes then passed those tests.
- Extra PDF checks reproduced lost follow-up/additional prose and insufficient renderer guards.
- Recorded model cases reproduced source meta-instruction evidence and conflicting allergy certainty; both received failing regressions and limited conservative containment.
- Approval replay initially overwrote review metadata; the regression failed before the idempotent response fix.
- Long PDF fields initially crossed page bounds; coordinate checks now pass with flowing long-field rendering.
- Missing audit-policy freshness initially allowed an older saved audit snapshot to export; it now requires a current policy in HTTP approval/precheck/download and renderer checks. Legacy records are preserved and return a useful 409 review instruction.
- An early production-smoke attempt exited 1 at its startup deadline. The smoke harness now uses explicit Windows npm invocation and a bounded 45-second readiness window; subsequent final executions pass. The original transient cause was not isolated, so no unsupported root-cause claim is made.
- Earlier exploratory extraction scores preceded conservative schema handling and are not current performance. The final value/status score includes conservative uncertainty handling; earlier runs differ in corpus and normalization, so they are not a controlled causal comparison. Adding value-only/allergy-state metrics used a deterministic replay of recorded real predictions, not replacement predictions or tuned labels.

## Remaining risk by class

**Software/workflow verification limits:** source-navigation logic has a deterministic regression, but full browser source-edit/discard/new-session and final download-completion flows remain unverified after the automation dialog blocker. Native form submission cannot report completed delivery. Extreme metadata/font/Unicode visual layouts are not exhaustively assessed. Appointment subfield statuses are now preserved and independently validated; complex temporal/clinical meanings still require clinician review.

**Operational:** one workstation/process, one extraction, no distributed queue/authorization, unbounded history/list scans, stage-specific deadlines and no comprehensive hostile-native-file sandbox. Peak native/process memory, GPU utilization and long-duration leak behavior were not measured. Windows backup ACLs/disk protection remain operator responsibilities. Clean install without lifecycle scripts does not establish a clean native build on every machine.

**Clinical validation:** model omissions, wrong typed fields, missing/unknown/conflicting allergy interpretation, prompt-injection variants and lexical audit gaps remain. Source excerpts are incomplete provenance and original files are not archived. Constructed rule cases cannot establish broad clinical meaning. Qualified review/annotation and stakeholder-approved acceptance thresholds are outstanding; no numeric clinical target was invented.

**Environment-dependent:** actual acceleration was Vulkan, not CUDA. CPU fallback is implemented but not forced in this audit. Other OS/GPU configurations, live cloud availability and formal accessibility remain unverified. Automated tests do not certify compliance or clinical safety.

## Safe operation and upgrade

Keep loopback-only binding and cloud flags false for local operation. Use verified pinned weights and Node 24. Preserve the original source and compare every clinical field/instruction before confirmation/approval. Protect SQLite/WAL/login/backups with local account controls and disk protection; restore into a new file and verify privately. Never delete the database as a startup repair.

Old approvals do not automatically satisfy the new policy. Open the saved report, save/re-audit, inspect findings and explicitly approve the new version before PDF export. No existing history is rewritten by that requirement.

## Publication and continuation

The earlier user instruction to push this project to GitHub remains authorization for publishing this verified work; no fresh approval is required. The audit commit contains these deliverables; the exact published SHA and remote CI result are supplied in the handoff rather than invented here. Baseline and recovery details remain in [PROGRESS.md](PROGRESS.md).

Next clinical action: qualified independent review of the fixed synthetic corpus and residual failures, then a frozen hold-out/schema-output study under agreed acceptance criteria. Next browser action: repeat the documented source-edit/discard/new-session/approval/download and accessibility checks in an interactive browser with functioning dialog control. Neither action may be replaced by a green software badge.
