# Healthcare Discharge Instructions Generator

A local, single-clinician workspace for Qwen extraction, source verification, English discharge instructions, explicit audit findings, and approved PDF downloads. React + Vite + Express + TypeScript, with SQLite persistence.

The server binds to **127.0.0.1 only**, requires authentication, and rejects foreign hosts and origins. This is a desktop workflow; LAN hosting, reverse proxies, multi-user roles, and clinical certification are outside its supported scope. Automated checks cannot establish clinical safety. A clinician must compare the original source with every instruction before approving.

## Windows quick start

Install Node.js **24.x**, npm, and Git:

```powershell
git clone https://github.com/Abishek-805/Health_Qwen.git
cd Health_Qwen
$env:NODE_LLAMA_CPP_POSTINSTALL = 'skip'
npm ci
Copy-Item .env.example .env
npm run download-model
.\start.bat
```

Open [localhost:3000](http://localhost:3000). The browser asks for a username and password. On first startup the app generates a strong password and saves the login in **`.runtime/login.txt`**; only its salted scrypt hash is used by the server. These files are ignored by Git. Keep them private. Alternatively, configure both `APP_USERNAME` and `APP_PASSWORD` (at least 16 characters) in `.env`. The authenticated username is the recorded reviewer identity; the UI cannot impersonate a different clinician.

`NODE_LLAMA_CPP_POSTINSTALL=skip` skips the install-time native probe. Native backend selection and the pinned model are exercised by `npm run test:model`; compatible prebuilt bindings or native build tools are still required for inference. Do not treat successful package installation as proof of hardware readiness.

- `start.bat` starts both the frontend and backend in one background production server, waits until it is ready, and opens the app in your default browser. It shows startup progress immediately and reuses the built frontend/backend for faster reopening. The first launch, or a change to source/configuration/package inputs, rebuilds automatically; subsequent launches reuse that build. Running it again reopens the existing app without starting another server. It creates `.env` only when absent and reports log locations. Use `npm run dev` for development watching.
- `stop.bat` stops only this checkout's recorded process tree. **Saved documents, settings, and approval history survive restarts.** Unsaved browser edits do not.
- Runtime logs/process state are in `.runtime/`; clinical data is in `data/discharge.sqlite`. Both directories are ignored by Git and Vite watching.
- The launcher checks port availability and waits for HTTP readiness, using the configured port. `/api/health` checks HTTP readiness; `/api/extraction-status` distinguishes missing, unloaded, and ready models.
- `npm run dev` starts the foreground development watcher. Backend changes restart the server; Vite changes can discard unsaved browser edits.

## Workflow and safeguards

1. Upload a PDF, PNG, JPEG, or paste text. Upload signatures and content types must agree. Limits: 15 MB/file, 20 PDF pages, 32,000 characters pasted text, and **12,000 extracted characters** for the local model, plus a tokenizer-checked context budget. Larger notes must be split; the app does not silently truncate them.
2. Digital PDF text or local Tesseract OCR feeds the pinned Qwen GGUF model. Python/PaddleOCR and its temporary clinical-image files were removed. OCR recognition has a timeout; inference is single-flight with a cancellation deadline. First-use OCR/native assets may require network access.
3. Evidence validation requires the extracted value to agree with its quoted source. `UNCLEAR` fields must be corrected or removed before source confirmation. Every care category can be reviewed and edited.
4. English generation uses local templates, including patient ID and known allergies. There is no cloud extraction fallback.
5. Saving a draft or edit makes the server assign its version and recompute the audit. Edits clear prior approval; version checks reject stale saves from another tab. **Apply Fix & Re-audit** rebuilds supported sections and removes matching duplicate medication rows, including exact schedule/duration echoes, then saves the corrected fields and report together. It opens Step 5 automatically when the saved audit has no critical finding and no unavailable requested cloud audit. Conflicting prescriptions remain blocked; this action does not grant final clinical approval. Untested categories display **NOT EVALUATED**, not a pass. Rule checks cover specific patterns; clinical meaning still requires human review.
6. Approval requires the signed-in clinician's explicit review acknowledgment. Critical findings or an unavailable requested cloud audit block approval. PDFs are generated only from a **saved approved document ID**; client-supplied audits, approval metadata, and PDF document payloads are rejected.

The database stores verified source fields and saved report versions; original uploaded files are not retained. Keep the original clinical source available for review. Historical events are append-only through the application and database triggers. Protect the database and backups with OS access controls and disk encryption; SQLite storage is not application-encrypted.

## Configuration

Existing `.env` files are preserved. Never commit credentials or clinical data.

| Variable | Purpose |
| --- | --- |
| `PORT` | Shared HTTP port, default `3000` |
| `NODE_ENV` | `development` for Vite middleware; `production` for built frontend assets |
| `DATA_PATH` | SQLite path, default `data/discharge.sqlite`; use an absolute path when overriding |
| `APP_USERNAME`, `APP_PASSWORD` | Optional configured account; otherwise use the generated `.runtime/login.txt` account |
| `CLOUD_PROCESSING_ENABLED` | Default false; required for any Gemini client to be created |
| `GEMINI_MODEL` | Explicit, available model identifier required for cloud operations; no assumed model default |
| `GEMINI_API_KEY`, `GEMINI_API_KEY_BACKUP` | Optional cloud credentials |
| `GEMINI_AUDIT_ENABLED` | Default false; enables supplemental cloud findings when cloud processing is also enabled |
| `GEMINI_GENERATION_ENABLED` | Default false; enables optional cloud section rewriting, alongside the cloud opt-in |
| `DISABLE_HMR` | `true` disables frontend HMR/watching |

Cloud section rewriting sends verified clinical data and section text to Google. Optional semantic audits also send the report. Setting a key alone does not enable cloud processing. A requested cloud audit that fails, times out, or returns invalid findings is marked unavailable and blocks approval. English initial generation remains local.

Only English reports are supported. Historical language filters or archived artifacts do not establish multilingual support. The old `APP_URL` setting is not used.

## Models

```powershell
npm run download-model
```

The downloader pins the official Qwen model revision and verifies SHA-256, streams to a unique temporary file, and atomically publishes verified weights. It preserves existing weights if a replacement fails. Model initialization also verifies the checksum. Weights are stored in `models/qwen2.5-1.5b/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` (1,117,320,736 bytes), outside Git. CPU, Vulkan, CUDA, or Metal reporting reflects the actual selected backend.

## Backups and recovery

```powershell
npm run backup -- C:\PrivateBackups\discharge-2026-10-20.sqlite
npm run restore -- C:\PrivateBackups\discharge-2026-10-20.sqlite C:\PrivateBackups\restored.sqlite
```

Backup uses a consistent SQLite snapshot. Restore checks integrity and schema presence, refuses active WAL databases, and **never overwrites an existing file**. To use the restored copy, stop the app, set `DATA_PATH` to its absolute path in `.env`, then restart. Keep the original database until recovery is verified. Backups include clinical records and approval history; secure them and define an appropriate retention policy. No automatic deletion or retention purge runs.

## Checks

```powershell
npm run lint              # TypeScript validation
npm test                  # Authentication, trust boundaries, persistence/recovery, dose/evidence, PDF HTTP/content, architecture
npm run test:model        # Nine model/OCR/extraction/audit/budget tests; requires downloaded weights and native runtime
npm run test:pdf-upload   # Build first; actual two-page digital/scanned multipart uploads, local model, isolated port 3308
npm run test:integration  # Eighteen service-level acceptance criteria; requires model/OCR
npm run test:windows      # Windows batch lifecycle checks, uses port 3301
npm run test:clinical     # Synthetic clinical regressions and scorer checks
npm run evaluate:model    # 31-case pinned-model evaluation; requires weights/native runtime
npm run evaluate:pipeline # Labelled rule audit and all-section PDF evaluation
npm run evaluate:ocr      # Pipeline evaluation plus one known-text OCR fixture
npm run build
npm run test:production   # Built real server; synthetic database, auth/save/approval/PDF/restart
npm run test:development  # Vite private-file denial and the same synthetic HTTP flow
npm audit
```

`.github/workflows/ci.yml` runs clean installation, TypeScript checks, deterministic/security/clinical/PDF tests, pipeline evaluation, build, development/production smoke, and dependency audit on Node 24. Hardware/model benchmarks are explicit local checks. The audit report distinguishes executed checks from unverified clinical and platform claims.

For production-mode local execution:

```powershell
npm run build
npm start
```

Build and start explicitly select production mode, including when the shell or `.env` selected development. On macOS/Linux use the same commands. Run commands from the repository root. There is no Dockerfile or public deployment configuration.

## API

All API routes except `/api/health` require the same HTTP Basic credentials as the app. Writes require the local origin; there is no CORS grant. Requests are rate limited. Do not send credentials over a network by changing the bind address.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health`, `/api/session` | HTTP health (public), authenticated identity |
| GET | `/api/extraction-status`, `/api/ai-status` | Actual local status, optional cloud connectivity |
| GET / PUT | `/api/settings` | Persisted hospital name/department; identity is server-owned |
| GET | `/api/patients` | Patient index derived from saved documents |
| POST | `/api/extract-discharge` | Multipart `file` or `textInput` |
| POST | `/api/generate-instructions` | Confirmed `verifiedData`; English template generation |
| POST | `/api/audit-instructions`, `/api/validate-instructions` | Non-persistent audit of verified data and report |
| POST | `/api/regenerate-section` | Explicitly enabled cloud rewrite; otherwise edit manually |
| GET / POST | `/api/discharge-documents` | List/create; writes accept only `verifiedData`, `generatedReport`, `hospitalInfo` |
| GET / PUT | `/api/discharge-documents/:id` | Read/edit a saved record; PUT requires `If-Match` with the current version; `/api/documents` aliases remain |
| POST | `/api/approve-instructions`, `/api/approve-document` | `documentId`, current numeric `reportVersion`, `clinicianReviewConfirmed: true`, optional `signatureNote` |
| POST | `/api/precheck-approved-pdf`, `/api/generate-approved-pdf` | Saved `documentId` only; precheck JSON, download PDF attachment |

## Files and troubleshooting

`src/` contains the UI/shared types; `server/` contains routes, validation, authentication, SQLite, extraction, audit, and PDF services; `scripts/` contains Windows lifecycle tools. `docs/AUDIT_REPORT.md` is the current audit, `docs/dependency-audit.json` is the dependency snapshot, and `docs/screenshots/` contains verification images. Historical cleanup notes are explicitly archived.

- Read `.runtime/stderr.log` and `.runtime/stdout.log` for startup failures. Logs omit extracted clinical text.
- Missing model/checksum mismatch: run `npm run download-model`.
- Port in use: choose another `PORT` or stop the owning checkout. The stop script never kills an arbitrary port owner.
- Authentication failures: use `.runtime/login.txt`, or set both account variables consistently. Browsers may cache Basic authentication until the browser session ends.
- Extraction busy/too long: finish the current request or split the source; do not retry in parallel.
- SQLite errors: preserve the database and WAL files, stop the app, and recover from a verified backup. Never delete the database to repair a startup error.

## Engineering and evaluation documentation

- [Architecture and full system design](docs/architecture.md)
- [API reference](docs/api.md)
- [Security and privacy](docs/security-and-privacy.md)
- [Setup, operations and recovery](docs/operations.md)
- [Clinical evaluation protocol](docs/clinical-evaluation.md) and [qualified review form](docs/clinical-review-template.md)
- [Formal project report](docs/project-report.md)
- [Current findings](docs/audit/architecture-security-review.md), [roadmap](docs/audit/remediation-roadmap.md), [final verification](docs/audit/final-verification-report.md), and [resumable progress](docs/audit/PROGRESS.md)

The synthetic evaluation is not a clinical validation. The earlier prompt-v2 31-case run had 83.97% strict value agreement but only 39.66% value-and-status agreement. The subsequent [Qwen schema/status fix and its verification](docs/audit/qwen-schema-fix.md) uses constrained local output and retains genuine uncertainty. The latest 31-case development run measured 84.81% value-only and 68.78% value/status agreement, with 25 missing predicted fields. These are author-labelled synthetic scores, with substantive omissions and manual review still required. See the protocol for denominators and limitations. Matching source text cannot establish clinical correctness or recover an omitted fact.

Medication evidence/audit rules conservatively use line/semicolon clauses; wrapped/combined or stopped/historical instructions may need manual reconciliation. Missing allergies remain not provided. Downloads include all eight reviewed report sections and do not invent a discharge date. The UI reports a download request, not confirmed completion.

Older saved audits need a fresh save/re-audit and clinician review before approval/export under the new audit policy. Existing records and history are preserved. Long clinical PDF fields now paginate rather than overflowing a page.

The [earlier audit](docs/AUDIT_REPORT.md) is historical; current findings and executed checks are in the reports above.

The Qwen badge refreshes automatically. LOADS ON FIRST USE means local weights are available but not yet initialized; LOADING, EXTRACTING and READY reflect actual server state. Extraction uses the localhost API and local Qwen, with no external extraction API/fallback. In verification, click an UNCLEAR badge to mark a source-checked value FOUND; click FOUND to flag it UNCLEAR again. The bottom **Mark all reviewed** button marks current nonempty values FOUND after you compare every field with the source; empty fields stay MISSING. These actions invalidate old source confirmation and do not approve a report.

GPU offloading adapts to available memory, including the output layer when it fits. On the measured Vulkan workstation this used 29 layers instead of the previous fixed 28. Extraction logs record separate proposal/structured inference times and actual generated-token counts. Cold model loading, OCR, document length and hardware load still affect elapsed time; there is no fixed extraction-time guarantee. See the [performance and review follow-up](docs/audit/review-and-extraction-performance.md).

The extraction protocol retains the original local proposals and reconciles a second schema-constrained local read. Unmatched/conflicting proposals and explicit uncertainty remain reviewable. Both reads run in the same local Qwen engine; source matching and model agreement do not establish clinical correctness.
