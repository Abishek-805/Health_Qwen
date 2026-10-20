# Healthcare Discharge Instructions Generator: engineering project report

> Audit snapshot from commit aa63a40. The subsequent Qwen schema/status and verification-control investigation is recorded in [the follow-up report](audit/qwen-schema-fix.md). Previous model scores below describe prompt v2, not the revised v7 two-read protocol.

Date: 20 October 2026. Repository baseline: `374b2d4`; this report describes the remediation changes delivered with this report. Exact publication revision and CI outcome are recorded in the handoff. No clinical endorsement or regulatory certification is asserted.

## 1. Project summary and problem

Discharge information can be difficult to transfer faithfully from a source note into readable instructions. This project provides a local workspace for extraction, explicit clinician verification, English report assembly, limited audit findings, saved approval and PDF delivery. The engineering objective is traceable assistance, not independent treatment selection.

## 2. Objectives, requirements and scope

Preserve local Qwen extraction and initial English templates; prohibit automatic cloud fallback; protect authentication, data persistence, source uncertainty, report versions and approval/PDF integrity. Inspect actual behavior, reproduce defects, remediate narrowly, measure synthetic regressions and document remaining gaps. Excluded are EHR integration, vector retrieval, distributed services, public hosting, multi-tenant identity and unsupervised clinical use.

## 3. Existing system and review method

The baseline had passing security/PDF/build tests and useful lifecycle controls. Independent inspection identified gaps those tests did not cover: uncertainty promotion, unrelated medication evidence, missing allergy converted to NKDA, generic schedule wording, repeated/negated medication audit gaps, missing warnings hidden by headings, incomplete PDF report preservation and stale local workflow state. New targeted tests initially passed 1/10; later PDF, adversarial evidence and approval replay regressions independently reproduced additional defects.

Inspection covered the Express entry/router/security/validation, SQLite repository and maintenance scripts, PDF/OCR/Qwen/evidence services, generation/audit modules, React pages/wizard, lifecycle and CI. Production records and secret values were not read into reports. Tests used synthetic fixtures and isolated databases; cloud flags stayed disabled.

## 4. Implemented architecture and stack

The architecture remains a modular monolith. React 19 and TypeScript provide a six-step UI, Vite serves development assets/builds production assets, Express provides the same-origin local REST API, Node 24 SQLite stores JSON documents/settings/events, pdf-parse/Tesseract read documents, node-llama-cpp executes pinned Qwen GGUF weights, local templates build English reports, and jsPDF renders saved approved output. Gemini is explicitly optional for supplementary audit/section rewriting.

These choices reuse the implemented stack and avoid extra services/dependencies during remediation. They are not claims that the selected model or libraries satisfy clinical standards. Verified diagrams and detailed responsibilities are in [architecture.md](architecture.md).

## 5. Data flow and workflow

Upload/paste -> PDF/OCR text -> normalization -> local extraction -> evidence checks -> clinician correction/confirmation -> English template -> server save/recomputed audit -> review/edit/new version -> authenticated acknowledgment -> saved-ID PDF.

HTTP readiness differs from model readiness. Model initialization is lazy/shared, weights are checksum-verified, inference is single-flight and contexts are disposed. Input budgets reject oversized text instead of silently truncating. Resource deadlines are stage-specific rather than a comprehensive upload deadline.

## 6. Security, privacy and evidence

The app remains loopback-only with Basic authentication, salted scrypt verification, host/origin checks, request limits, reconstructed input and server-owned reviewer attribution. Original source uploads are not an archive. SQLite/backups are not application-encrypted; OS/disk protection remains required. Cloud-disabled network interception confirms no fetch calls in tested client/status/generation/audit paths. No live clinical cloud experiment was performed.

Evidence checks now retain model uncertainty, require medication-local source clauses, flag selected stopped/historical/conflicting contexts, reject recognized meta-instruction evidence and downgrade conflicting allergy statements. Malformed/missing field-status structures become UNCLEAR instead of being inferred FOUND. This intentionally increases review burden. Lexical checks still cannot prove role, intent, association or clinical correctness.

## 7. Generation, audit and output changes

Missing schedules are labelled Not specified; they no longer receive invented prescription directions. Empty allergy data remains not provided in review/PDF. Medication audits inspect repeated clauses and scoped units, and warning headings cannot mask an omitted verified warning. Categories outside local coverage stay NOT_EVALUATED.

PDF output includes all eight reviewed report sections alongside structured tables, labels output creation time rather than inventing a discharge date, and repeats approval/version checks inside the renderer. UI feedback says a download was requested, not completed. Report navigation/new-document sessions are isolated, and unsaved report changes trigger protection. Extracted source excerpts are visible. Replay of approval for an already-approved version is idempotent.

Long clinical paragraphs and oversized table/box content now flow across printable pages; a failing coordinate-based regression reproduced the previous overflow and verifies the fix across six long clinical fields. Audit-policy versioning prevents a pre-upgrade saved audit from authorizing a newly hardened export. Old records/history remain intact and require a fresh save/audit/review rather than automatic approval migration. Source edits are also guarded against leaving the verification step or entering an old approval view before regeneration.

## 8. Persistence and recovery

SQLite stores current document JSON, singleton settings and append-only event snapshots. Transactions compare expected versions and save document/event together. Concurrent same-version updates produce one success and one conflict. Editing clears prior approval. Backup/restore checks use synthetic data, consistent snapshots and new destinations. Append-only triggers do not protect against privileged database replacement. Unbounded history/list growth remains a workstation-scale limitation.

## 9. Evaluation methodology

A versioned 31-case synthetic corpus separates author-written labels from model output. The same pinned model was actually executed on Vulkan; no alternate model or cloud extraction substituted. Model output and evidence-filtered output are scored separately, with missing predictions retained and undefined ratios null. Matching is strict and does not adjudicate paraphrases. Nine deterministic audit perturbations and eight PDF section markers evaluate selected pipeline properties. One rendered OCR fixture measures CER/WER.

The final benchmark uses conservative schema handling. Nonempty UNCLEAR values include conservative schema-coercion fallbacks or explicit model uncertainty; those causes were not separately counted. Earlier exploratory 76–77% scores preceded that change and must not be represented as final current performance. The final scorer adds value-only and allergy-state metrics; it replays recorded actual predictions without model tuning or label substitution. Methodology and human release gates are in [clinical-evaluation.md](clinical-evaluation.md).

## 10. Actual measured results

The final pinned-model run completed **31/31** cases with zero execution errors. Strict value agreement was **199/237 (83.97%)**; exact value-and-status agreement was **94/237 (39.66%)**, before and after final evidence checks. Both denominators include explicit empty-field labels. There were **30 missing predicted field paths**. Allergy-state agreement was **27/31 (87.10%)**. Most nonempty predictions remained UNCLEAR. Of three asserted FOUND facts, one matched the strict labels and two did not: asserted-fact precision 1/3, recall 1/123, F1 0.01587. Unmatched assertions include possible formatting/association differences and are not adjudicated hallucinations. The dedicated additional-notes case still omitted the note despite the corrected transport/schema path. These outcomes block clinical-readiness claims.

The first process-cold case took 9,637 ms including model initialization; model load 3,903 ms; median case 3,406 ms; summed case wall time 113,618 ms. OS/disk caches were not isolated. Runtime token/throughput fields are existing character-based approximations, and heap/VRAM snapshots are not peak native/process utilization. No exact tokenizer throughput or leak-free/peak-memory claim is made.

The selected rule benchmark matched all nine blocking verdicts and its labelled critical categories (precision/recall 1 on this small constructed set); all eight PDF markers were present. The one clean rendered image had CER=0 and WER=0 with Tesseract, recognition pipeline wall time 2,616 ms. None of these narrow checks validates model omissions, complex OCR or clinical semantics generally.

Actual software command results are maintained in [final-verification-report.md](audit/final-verification-report.md); machine-readable synthetic measurements are in [evaluation-results.json](audit/evaluation-results.json). Existing integration tests are service-level checks, not comprehensive browser tests. Remote CI results must be distinguished from locally running the same commands.

## 11. Risks, mitigation and future work

Software containment retains uncertainty and blocks critical/unavailable/stale approvals. Operational containment retains local-only hosting, controlled backups and bounded single-flight inference. Clinical gaps remain: wrong typed medication names, omitted warnings/care, missing/conflicting allergy interpretation, prompt-injection variants and incomplete provenance. Qualified source review is required; no numeric acceptance threshold has been approved.

Further work should follow fixed independent annotations, schema-constrained output evaluation, wider governed source/OCR coverage, clinician adjudication and accessibility testing. Do not repeatedly tune against this corpus or add distributed architecture to improve a benchmark score. Long-document chunking, normalized storage, enterprise identity and cryptographic signatures are separate scoped projects only if justified.

## 12. Conclusion and references

The remediation improves demonstrated software invariants and makes evaluation/reporting more honest. It does not establish clinical validation. The application remains an assisted local review tool with substantial measured uncertainty and omissions.

Primary references: source modules listed in [architecture.md](architecture.md), [API contracts](api.md), [security/privacy](security-and-privacy.md), [operations](operations.md), [clinical protocol](clinical-evaluation.md), and [finding dispositions](audit/architecture-security-review.md). No test score, approval attribution or clinical endorsement was fabricated.

Final privacy checks also reproduced authenticated development-file disclosure with a synthetic sentinel and verified Vite denial of runtime/data/model paths. Follow-up field uncertainty now survives editing and server reconstruction; non-ISO source dates remain visible. Microgram glyph evidence cannot validate grams. Each fix has a targeted regression; these checks still do not establish clinical correctness.
