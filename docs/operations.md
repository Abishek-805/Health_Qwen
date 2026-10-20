# Setup, operations and recovery

## Runtime and installation

Use Node 24.x and npm with the committed lockfile. Run commands from the repository root. Native inference uses node-llama-cpp and the available supported CPU/GPU backend; an installed GPU or a skipped postinstall probe is not evidence of functioning acceleration.

```powershell
$env:NODE_LLAMA_CPP_POSTINSTALL = 'skip'
npm ci
# Only copy when .env does not already exist:
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run download-model
.\start.bat
```

The model downloader verifies pinned official Qwen weights before publishing them. Do not replace the model with an unverified file. Existing `.env`, data and weights should be preserved. Dependency changes require targeted review; do not run force audit-fix commands.

## Launch and readiness

`start.bat` starts the combined frontend/API in a hidden background process, polls `/api/health`, and opens the app in the default browser. Repeating it reopens the managed URL. `stop.bat` stops only the recorded PID/start-time process tree; it does not kill all Node processes or arbitrary port owners. SQLite records survive restart; unsaved browser changes do not.

Logs are ignored under `.runtime/stdout.log` and `.runtime/stderr.log`. Read them privately when troubleshooting. HTTP health is not model readiness: `/api/extraction-status` distinguishes MISSING_MODEL, NOT_LOADED and READY. First extraction verifies/loads weights and can be slower than warm calls.

`npm run dev` enables backend watch restart and Vite middleware. Production-mode local execution uses `npm run build` and `npm start`; those scripts force production assets even if the shell/.env selected development. There is no supported public hosting configuration.

## Account and configuration

First startup creates the local login under `.runtime/login.txt` unless configured account variables are supplied. Read that file locally; never copy it into an issue, screenshot, report or Git. Browsers can cache Basic authentication for their session. The user account supplies reviewer attribution; it is not a verified professional credential directory.

| Variable | Meaning |
| --- | --- |
| PORT | Shared local HTTP port, default 3000 |
| NODE_ENV | Development middleware or production assets; build/start scripts explicitly force production |
| DATA_PATH | SQLite file; use an absolute private path when overriding; default `data/discharge.sqlite` |
| APP_USERNAME / APP_PASSWORD | Optional local account; password at least 16 characters |
| CLOUD_PROCESSING_ENABLED | Default false; required before a Gemini client can exist |
| GEMINI_MODEL | Explicit available model ID required for optional cloud operations |
| GEMINI_API_KEY / GEMINI_API_KEY_BACKUP | Optional server credentials; never expose values |
| GEMINI_AUDIT_ENABLED | Supplemental audit opt-in, default false |
| GEMINI_GENERATION_ENABLED | Section rewrite opt-in, default false; initial English generation still local |
| DISABLE_HMR | True disables frontend hot reload/watching |

For local-only operation retain false cloud flags. `/api/ai-status` reports disabled without calling the provider. `npm run test:clinical` includes a network-intercepted disabled-cloud test; it uses synthetic fixtures and does not validate live cloud availability.

## Backup and restore

Use new private destination filenames, not an active database or the only backup:

```powershell
npm run backup -- C:\PrivateBackups\discharge-backup.sqlite
npm run restore -- C:\PrivateBackups\discharge-backup.sqlite C:\PrivateBackups\restored.sqlite
```

Backup uses a consistent SQLite snapshot. Restore checks integrity and expected tables, refuses an active WAL source and never overwrites a destination. Stop the app, set DATA_PATH to the restored file, restart, and verify records privately before relying on the restored copy. Keep the original and protect all copies. The application does not configure Windows backup ACLs, disk encryption or retention.

## Verification commands

| Command | Scope |
| --- | --- |
| `npm run lint` | TypeScript |
| `npm test` | Fast security/validation/recovery/concurrency, clinical regressions, scorer checks, PDF/architecture |
| `npm run test:clinical` | Synthetic deterministic clinical/scorer regressions |
| `npm run test:model` | Existing local model/OCR suite; downloaded weights/native assets required |
| `npm run test:integration` | Existing service integration suite; not an end-to-end browser suite |
| `npm run evaluate:model` | Versioned 31-case local extraction benchmark; outputs ignored JSON |
| `npm run evaluate:pipeline` | Labelled rule audit and all-section PDF benchmark |
| `npm run evaluate:ocr` | Same plus one synthetic rendered-image CER/WER check |
| `npm run test:production` | After build: real npm start, synthetic temp database, auth/assets/save/approval/PDF/restart |
| `npm run test:development` | Vite middleware, synthetic private-file probes, auth/save/approval/PDF/restart; no real private files fetched |
| `npm run test:windows` | Stop managed app first; start/stop/stale PID/browser dispatch on test port 3301 |
| `npm audit` | Current registry advisory snapshot, not a guarantee of no vulnerabilities |

Run inference benchmarks sequentially to avoid GPU/memory contention. Evaluation outputs are not clinician validation. For offline imported synthetic outputs use `npm run evaluate:predictions -- --predictions synthetic-predictions.json`; keys are fixture IDs and values are canonical extraction objects. Ground truth is never substituted for missing predictions.

## Failure recovery

After this policy upgrade, an older saved approval is not automatically treated as current. Open it for review, save/re-audit the report, inspect the new findings and explicitly approve the new version before export. Records and historical approvals are preserved; a 409 policy error is a review requirement, not data loss.

- Port busy: select an unused port or stop the owning managed checkout; never kill an arbitrary process.
- Missing/checksum-failed model: run the verified downloader, then retry. Do not change GPU/context settings speculatively.
- Oversized source: split it deliberately; no silent truncation or background chunking exists.
- Busy extraction: wait for the current request; there is no job queue.
- UNCLEAR or missing clinical field: compare the original source and correct/remove the field. Wrapped or combined medication clauses may require manual review.
- Stale save: retain your text, reload the current record, reconcile changes and save again. A 409 is not a successful save.
- Cloud audit unavailable: keep approval blocked and retry a saved audit when correctly configured; do not label the missing check PASS.
- Download requested: inspect the browser download result. Form submission cannot prove completed delivery.
- Database/native/startup failure: preserve data and diagnostics. Do not delete the database/WAL or reinstall dependencies in place as a first repair.

Actual platform evidence and unrun checks are in [final verification](audit/final-verification-report.md).
