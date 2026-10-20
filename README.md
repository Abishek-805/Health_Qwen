# Healthcare Discharge Instructions Generator

Local Qwen extraction, clinician verification, English discharge handouts, rule-based safety checks, and server-generated PDF downloads. React 19 + TypeScript + Vite + Express + node-llama-cpp.

This is a prototype. Records and settings are held in memory and disappear when the server stops or restarts. The API has no authentication, and approval metadata can be supplied by clients. Use synthetic data in an isolated development environment. See the [full audit](docs/AUDIT_REPORT.md) for unresolved findings.

## Quick start on Windows

Install Node.js 22.3+ (Node 24.19.0 was tested), npm, and Git. Local inference uses CPU or a supported GPU; native build tools may be needed if a compatible node-llama-cpp binary is unavailable.

```powershell
git clone https://github.com/Abishek-805/Health_Qwen.git
cd Health_Qwen
npm ci
Copy-Item .env.example .env
npm run download-model
.\start.bat
```

Open [localhost:3000](http://localhost:3000), or the port configured in `.env`.

- Double-click `start.bat` to launch the combined frontend/API in the background. It creates `.env` from the example only if missing; it does not install dependencies or download models.
- Double-click `stop.bat` to stop the process tree launched by this checkout. **Stopping clears all in-memory records.** Download needed PDFs first.
- Logs and process identity live in ignored `.runtime/`. Duplicate starts are ignored. Stale process IDs are checked against their creation time before stopping anything.
- Startup checks that the process survives three seconds; inspect logs and `/api/health` to confirm readiness. The script prints the default URL; custom ports are read by the server from `.env`.
- The launcher uses `tsx server.ts` without backend watch mode to avoid resetting records on source edits. Stop and start after backend changes. Manually launched servers must be stopped in their own terminal.

For terminal development on Windows, macOS, or Linux, run `npm run dev` from the repository root. This uses backend watch mode, so backend edits can reset data.

## Actual processing flow

1. Upload PDF, JPG, PNG, or paste clinical text.
2. Digital PDF parsing or local Tesseract OCR extracts source text. The service also automatically attempts Python PaddleOCR for images and chooses the better result; missing PaddleOCR falls back to Tesseract. Python is optional, and its absence may print a traceback.
3. Local Qwen2.5-1.5B GGUF extraction structures the clinical data; source evidence checks downgrade unsupported values. **There is no cloud fallback when the local model is missing.**
4. A clinician verifies extracted data. English instructions use deterministic local templates.
5. Rule-based checks produce an audit across 18 named categories. Optional Gemini semantic checks can supplement them.
6. The review/approval UI and Express PDF endpoint create an attachment. Current gates check metadata, version, and critical status, but do not establish trusted clinician identity or protect against forged client payloads.

The UI currently generates English instructions. Existing Hindi/Tamil cloud paths do not establish validated multilingual support. Local extraction and default English generation/auditing need no Gemini key; section regeneration and the Gemini status endpoint can contact Google if a key is configured. OCR assets may need network access on first use.

## Configuration

Copy `.env.example` once; keep real keys out of Git. Existing `.env` files are preserved by the launcher.

| Variable | Behavior |
| --- | --- |
| `PORT` | Shared HTTP port, default `3000` |
| `NODE_ENV` | `development` uses Vite middleware; `production` serves built assets |
| `GEMINI_API_KEY` / `GEMINI_API_KEY_BACKUP` | Optional cloud credentials; backup support varies by operation |
| `GEMINI_MODEL` | Cloud model identifier; code defaults to `gemini-3.6-flash`, whose availability was not verified |
| `GEMINI_GENERATION_ENABLED` | Default false; enables existing non-English cloud generation paths. English still uses templates |
| `GEMINI_AUDIT_ENABLED` | Default false; enables optional cloud semantic auditing |
| `DISABLE_HMR` | `true` disables frontend HMR/watch behavior |

`APP_URL` is not consumed by the current code. Cloud operations send supplied clinical content to Google. Review the service configuration before using any sensitive content.

The model downloader stores `models/qwen2.5-1.5b/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` (about 1.12 GB). This directory is ignored. Missing model errors are resolved with `npm run download-model`. The downloader currently checks file size rather than a cryptographic checksum.

## Commands and verification

```powershell
npm run lint           # TypeScript checking (not a style linter)
npm test               # Seven top-level tests, including OCR and real local-model inference
npm run build          # Frontend assets + ESM server in dist/server.js
npx tsx server/tests/test-server-pdf-endpoint.ts
npx tsx server/tests/test-step6-architecture.ts
npx tsx server/tests/test-ui-integration-flow.ts
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-lifecycle.ps1
```

`npm test` needs the model and OCR runtime and may be slow. It does not run every standalone test. The lifecycle check uses port 3301 and requires the managed app to be stopped. Archived manual diagnostics under `scripts/diagnostics/` are opt-in: some seed documents into a live server or write PDFs to the user's Downloads folder.

For production-mode smoke testing:

```powershell
npm run build
$env:NODE_ENV = 'production'
npm start
```

On macOS/Linux use `NODE_ENV=production npm start`. Run from the project root. A production build is not a security or clinical-readiness certification. There is currently no Dockerfile, deployment pipeline, or persistent database.

## API map

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Process health; does not verify model readiness |
| GET | `/api/extraction-status` | Local model/device status |
| GET | `/api/ai-status` | Optional Gemini connectivity call |
| GET / PUT | `/api/settings` | In-memory settings |
| GET | `/api/patients` | In-memory patient index |
| POST | `/api/extract-discharge` | Multipart `file` or `textInput` |
| POST | `/api/generate-instructions` | `verifiedData`, optional language/version/document ID |
| POST | `/api/audit-instructions`, `/api/validate-instructions` | `verifiedData`, `report`, optional document ID |
| POST | `/api/regenerate-section` | Cloud section regeneration |
| GET / POST | `/api/discharge-documents` | List/create documents; `/api/documents` is an alias |
| GET / PUT | `/api/discharge-documents/:id` | Read/update document; `/api/documents/:id` is an alias |
| POST | `/api/approve-instructions`, `/api/approve-document` | Reviewer metadata and document ID |
| POST | `/api/precheck-approved-pdf` | JSON validation before download |
| POST | `/api/generate-approved-pdf` | PDF attachment; JSON, form `payload`, or document ID |

## Repository layout

```text
start.bat / stop.bat       Windows launch controls
scripts/app.ps1           Shared lifecycle implementation
scripts/test-lifecycle.ps1 Windows lifecycle regression checks
scripts/diagnostics/       Archived manual PDF/server diagnostics
src/                      React UI, shared types, browser utilities
server.ts                 Express + Vite/static server entry
server/ai/                Optional Gemini operations and local templates
server/audit/             Deterministic and semantic checks
server/repositories/      In-memory stores
server/routes/            API routes
server/services/          OCR, extraction, validation, PDF rendering
server/scripts/           Model downloader
server/tests/             Tests, benchmarks, synthetic fixtures
docs/AUDIT_REPORT.md      Current audit and remediation priorities
docs/dependency-audit.json Raw npm audit snapshot
docs/CLEANUP_MANIFEST.md  Historical cleanup record (not a current guarantee)
docs/screenshots/         Historical UI screenshots
models/                   Ignored local model weights
.runtime/                 Ignored process identity and logs
dist/                     Ignored generated build output
eng.traineddata           Existing local English OCR data
```

npm and `package-lock.json` are the canonical dependency workflow; the obsolete Bun lockfile was removed. Root Vite/TypeScript/HTML entry files stay in their conventional locations.

## Troubleshooting

- Missing `tsx`: run `npm ci` from the root.
- Missing GGUF: run `npm run download-model`; the page can load without it, extraction cannot.
- Port in use: stop this checkout with `stop.bat`, or choose another `PORT`. The stop script never kills an arbitrary port owner.
- Startup failure: read `.runtime/stderr.log` and `.runtime/stdout.log`. The server listens on all IPv4 interfaces (`0.0.0.0`), so isolate it with host/network controls.
- Records disappeared: restarts, crashes, and watch-mode reloads clear the repository; there is no database recovery.
- Production ESM error from `server.cjs`: rebuild and use the updated `npm start` (`dist/server.js`).
