# Historical audit notice

This report describes the earlier remediation baseline. Subsequent independent regressions reopened clinical evidence, missing-allergy and PDF-preservation issues. See [current findings](audit/architecture-security-review.md) and [final verification](audit/final-verification-report.md) for current dispositions. Historical green checks are not evidence that the later cases were covered.

# Audit remediation and verification report

Date: **20 October 2026**, Asia/Kolkata. Repository: **Abishek-805/Health_Qwen**. This report replaces the initial audit recorded in commit `9e4f183`. It covers source/configuration, dependencies, authentication, storage/recovery, approval/PDF trust boundaries, extraction/OCR, audit behavior, UI, Windows lifecycle, and local build/runtime verification.

## Result and supported scope

The identified software defects were repaired or bounded by explicit safeguards for an **authenticated, single-clinician, localhost-only application**. The dependency scan now reports **zero known vulnerabilities**. Saved data survives restarts, server-owned approvals cannot be supplied by clients, and uncertain/unexecuted checks cannot silently become successful checks.

Clinical correctness is **not certified**. A real model-generated unsupported medication instruction was observed during synthetic browser testing; evidence validation flagged it, and the verification UI was strengthened to expose and block unresolved uncertain fields. This is why clinician source review remains mandatory. Comprehensive clinical evaluation and external/cloud/platform validation remain separate requirements; they are not marked complete by passing software tests.

## Original findings and disposition

| ID | Initial issue | Resolution and current boundary |
| --- | --- | --- |
| A01 | Unauthenticated patient/settings/approval APIs on all interfaces | **Fixed for local use.** Bind to 127.0.0.1; HTTP Basic authentication protects UI and API; generated credentials use a salted scrypt hash, or an explicit configured account. Foreign hosts/origins and cross-site requests are denied. One authenticated account owns this workspace; no LAN or multi-user deployment is supported. |
| A02 | Forged client audit/approval and full-payload PDF bypass | **Fixed.** Document writes accept an allowlist; audits and versions are computed by the server; edits remove approval. Approval binds the authenticated actor and reviewed report version. PDFs resolve only saved approved IDs and check current report/audit versions and critical/unavailable status. |
| A03 | Restart data loss, no durable approval history/recovery | **Fixed.** SQLite WAL storage, explicit schema version, transactional saves, append-only event history, consistent backup, integrity-checked restore to a new file. Compare-and-swap version checks protect writes and approvals against intervening changes; stale browser saves return 409. Storage/backups require OS access controls and disk encryption. |
| A04 | Clinical text/filenames in logs; Python OCR temp-file leaks | **Fixed in current paths.** Removed clinical previews and patient filename logging. Removed the unsupported Python/PaddleOCR fallback and temporary clinical-image files; supported OCR uses Tesseract workers with cleanup. Existing historical files/logs outside the current code were not destructively purged. |
| A05 | Weak evidence matching and medication numeric comparisons | **Strengthened and regression tested.** Value and quoted evidence must both agree; token overlap cannot establish a fact. Numeric decimal boundaries are preserved. Doses include units and attached quantities, schedule changes are checked, uncertain fields cannot be confirmed, and all care fields are editable. This remains heuristic checking, not validated medical reasoning or proof that extraction is complete. |
| A06 | Failed semantic checks silently appeared to pass | **Fixed.** Requested cloud audit failures, invalid findings, and timeouts produce unavailable status and block approval. Unevaluated categories remain NOT EVALUATED even if a cloud call completes. Coverage limitations and actual check counts appear in the UI; no “verified safe” label is applied to unevaluated categories. |
| A07 | Weak request shapes/file validation/resource limits | **Fixed/bounded for local use.** Explicit clinical/report/settings parsing; protected write fields rejected; matching upload signatures/MIME required; JSON, multipart, source-length, PDF-page, model-token, concurrency, request-rate, OCR, and inference limits. Errors are sanitized. This is not a malicious-file penetration or sustained-load certification of native libraries. |
| A08 | Cloud processing without a coherent opt-in | **Fixed.** Client construction requires CLOUD_PROCESSING_ENABLED=true and an explicit model; optional audit/rewrite switches are separate. Default extraction and English generation are local. Cloud rewriting reports errors instead of pretending to apply changes. Unused cloud extraction code was removed; no speculative model identifier is assumed. |
| A09 | Incorrect passing-category count | **Fixed.** Count actual PASS category summaries. The UI separately displays checked and unevaluated categories, with conservative wording. |
| A10 | Patient index/count/identity/timestamp inconsistencies | **Fixed.** Derive patient indexes/counts from saved records. Server-generated IDs remain immutable; creation times are retained and update times refreshed. Stale writes are rejected rather than overwriting newer reports. |
| A11 | Injected sample patients, editable demo identity, fake settings saves | **Fixed.** Removed injected patients and clinician impersonation controls. Settings persist to SQLite, load on startup, and only show success after saving. Approval identity comes from authentication. Explicit demo input buttons remain labeled as demos. |
| A12 | Mutable model URL, size-only integrity check, partial downloads | **Fixed.** Pin official revision and SHA-256, stream into a unique temporary file, verify before atomic publication, preserve old weights on failure, and verify again at initialization. Download cancellation and redirect bounds are supplied by native fetch. |
| A13 | Vulkan mislabeled CUDA; unbounded concurrent model use | **Fixed.** Report actual selected backend and model readiness; deduplicate initialization and allow one inference at a time. Tokenize source/system input against the pinned context budget before generation. The updated 8192-token context was exercised on this Windows Vulkan machine. Token-speed estimates remain approximate. |
| A14 | Misleading test entrypoint and missing repeatable CI | **Fixed.** Separate deterministic/security/PDF tests from hardware benchmarks. Added Node 24 GitHub Actions checks for clean installation, typing, tests, build, and npm audit. A clean npm ci completed locally. Remote workflow execution must be checked separately from local results. |
| A15 | Large frontend bundle and accessibility gaps | **Improved and locally checked.** Removed the duplicate browser PDF renderer and reused the real server renderer in tests. Frontend JS fell from about 714 kB to about 318 kB, with no >500 kB chunk warning. Added labels, keyboard access/current-step state, focus outlines, darker small text, and an accessible status refresh button. Formal WCAG/screen-reader certification is not claimed. |

## Additional defects found during browser verification

- Fixed the array “Add” updater writing a literal `section` property instead of the selected array.
- Added verification/editing for activity restrictions, wound care, warning signs, emergency instructions, and additional notes.
- Exposed uncertain medication instructions/duration/name and follow-up status; corrected editing/status updates and reject unresolved UNCLEAR values at the server boundary.
- Included known allergies and patient ID in the English template; removed the invented generic outpatient-helpline instruction.
- Fixed cloud rewrite request/response field mismatch and made failed cloud rewriting visible.
- Removed optimistic save fallback: failed saves no longer masquerade as saved records. Await writes and use server-returned versions/audits.
- Block approval navigation while report text is unsaved; preserve the saved record identity when revising verified source data. Existing records can reopen their saved source fields.
- Fixed native form PDF downloads being rejected by the origin guard: use a same-origin referrer policy while continuing to reject foreign/null origins. Actual browser PDF download succeeded after the fix.
- Fixed production build/start mode so an inherited development environment cannot ship the development React bundle or start Vite instead of built assets.
- Fixed the Windows readiness probe to use the actual IPv4 port and wait for HTTP readiness, including cold starts and custom ports.
- Removed external web-font requests and old manual diagnostics that relied on forged approval payloads or wrote to Downloads. Their coverage is replaced by maintained tests.

## Dependency remediation

Initial snapshot: **10 affected package entries: 3 critical, 3 high, 3 moderate, 1 low**. Current snapshot: **0 vulnerabilities**, from npm audit after targeted compatible updates and transitive fixes. See [raw dependency audit](dependency-audit.json).

Updated Express to 4.22.3, Multer to 2.4.0, and node-llama-cpp to 3.22.2. Explicit transitive overrides pin compatible patched simple-git 4.0.2+ and @simple-git/argv-parser 2.0.1+. Other affected transitive packages were updated through npm audit fix. No forced downgrade of the inference engine was applied. A zero-advisory scan is not proof of absence of all vulnerabilities.

The initial native install probe stalled on this host. Installation was repeated with the package's documented postinstall opt-out; actual model/backend initialization and inference were then tested. Clean npm ci succeeded with NODE_LLAMA_CPP_POSTINSTALL=skip. Reinstalling dependencies does not itself certify GPU readiness.

## Verification evidence

Environment: Windows, Node **24.19.0**, npm **11.17.0**, pinned Qwen weights, actual **Vulkan** backend. Tests used synthetic examples in isolated databases; no real patient data was intentionally submitted and no live cloud clinical calls were enabled.

| Check | Observed result |
| --- | --- |
| Clean npm ci | Passed with native install probe skipped; native runtime tested separately |
| npm run lint | TypeScript checks passed |
| npm test | Hardening suites passed; 18 PDF/content/HTTP tests passed; PDF architecture check passed |
| Hardening coverage | Missing/wrong auth, foreign/null origin, hostile Host, forged approval/PDF body, malformed/uncertain source, upload spoofing, server audit/versioning, stale edit/approval, invalidation after edits, dose/unit/frequency/duration, process-boundary persistence, backup/restore, no-overwrite restore, append-only events, unavailable cloud audit |
| npm run test:model | **8/8 passed**, including actual OCR/Qwen and oversized-token rejection |
| npm run test:integration | **18/18 service acceptance checks passed** on the updated engine |
| npm run test:windows | Start, health, duplicate start, stop, repeated stop, stale PID protection checked |
| Model integrity | Pinned full-file SHA-256 verified; existing weights preserved |
| npm run build | Frontend and ESM server built; main frontend bundle about 318 kB |
| npm audit | **0 known vulnerabilities** |
| Browser, production mode | Local authentication; empty patient directory; settings save/reload; synthetic extraction; report edits/re-audit; authenticated sign-off; record survived server restart; native PDF download; unsaved edits disable approval and block step navigation |
| Downloaded PDF | Native file named Discharge_Instructions_Alex_Example_TEST-001_v2.pdf; synthetic test artifact, outside the Git repository |

[Browser verification image](screenshots/audit-verification.jpg) shows the persisted synthetic record, reviewed audit status, authenticated reviewer, and approved download action. The screenshot is a synthetic test result, not a clinical endorsement.

## Integrity and operational limits

- Keep `.env`, `.runtime/`, `data/`, weights, and backups private and out of Git. Credential generation and database setup do not overwrite existing configuration. The stop script targets only its recorded process tree.
- SQLite transactions protect committed data; original uploads are not retained. Keep the original clinical source for comparison. Backups/history also contain clinical information; retention, encryption, and restore rehearsals are operational responsibilities.
- Explicit account/version confirmation prevents impersonation and accidental stale approval within this local app. It does not validate professional licensing or provide an enterprise identity provider, shared access policy, or legally certified digital signature.
- The model can omit or invent facts. Evidence checks, stricter uncertainty handling, exact schedule checks, and explicit review reduce risk; representative clinician-labeled accuracy evaluation is still required before real clinical use. Do not infer complete semantic coverage from the 18 category names.
- Live Gemini availability/billing, broad clinical accuracy, adversarial native-file stress tests, every assistive technology, Linux/macOS GPU inference, and regulatory compliance were not verified. No claim of public deployment readiness is made.

## References

Model pin and checksum were checked against the [official Qwen repository metadata](https://huggingface.co/api/models/Qwen/Qwen2.5-1.5B-Instruct-GGUF?blobs=true): revision `91cad51170dc346986eccefdc2dd33a9da36ead9`, SHA-256 `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`, size 1,117,320,736 bytes. SQLite uses the [Node platform API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html). Origin/referrer behavior was checked against the [Fetch standard](https://fetch.spec.whatwg.org/#append-a-request-origin-header) and the actual browser result.
