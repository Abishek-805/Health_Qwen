# HTTP API reference

Implementation: `server/routes/api.ts`, `server/validation.ts`, `server/security.ts`. Prefix every path below with `/api`. This is an authenticated local API, not a public integration contract. Default base URL: `http://127.0.0.1:3000`.

## Common rules

- HTTP Basic authentication is required except for `GET /health`. Identity is the configured/generated local account.
- Hosts must be localhost/loopback; foreign and null origins and cross-site requests are rejected. Native clients may omit Origin; browser form requests are still subject to host/origin/fetch-site/auth checks. No CORS grant exists.
- JSON is the default request content type. JSON and URL-encoded bodies are limited to 1 MB. Protected requests share a 300/minute per-address rate budget.
- Errors are JSON `{ "error": "message" }` for API handlers. Authentication may return a plain-text 401 challenge. Unexpected errors return sanitized 500 messages; no successful save is confirmed by that response.
- Common statuses: 400 validation/malformed JSON; 401 unauthenticated; 403 origin/cloud/approval gate; 404 missing document; 409 stale/busy document; 413 upload/body limit; 415 wrong upload signature/type; 422 unusable OCR or range limits; 429 extraction busy/request budget; 500 processing/storage/native failure. Not every processing limit uses 422: the current 12,000-character inference guard throws a generic error and returns 500 through the route.
- Runtime validation, not TypeScript types alone, governs accepted inputs. Only English reports are accepted.

## Read/status endpoints

| Method / path | Request | Response | Side effects / external use |
| --- | --- | --- | --- |
| GET `/health` | None; public | `{status:"ok"}` | HTTP readiness only; does not load the model |
| GET `/session` | None | `{name,role}` | Authenticated server-owned identity |
| GET `/extraction-status` | None | `engine,model,status,device,geminiApiCalls,modelPath,modelLoaded,online,message,loadTimeMs` | No model initialization; model path is repository-relative; online means weights exist, not verified readiness; status distinguishes NOT_LOADED, LOADING, EXTRACTING, READY and ERROR |
| GET `/ai-status` | None | `{online,model,message}` | May send a connectivity prompt to Gemini only when cloud is enabled/configured; disabled mode does not create a client |
| GET `/settings` | None | Persisted `SystemSettings`, with account-derived `clinicianInfo` | No cloud |
| GET `/patients` | None | `PatientRecord[]` | Derived from saved documents; not an external registry |
| GET `/discharge-documents` | None | `DischargeDocument[]` | Full JSON list, newest row first; no pagination |
| GET `/discharge-documents/:id` | Nonempty ID, at most 200 characters | `DischargeDocument` | 404 if absent |

`/documents` and `/documents/:id` alias the document endpoints.

## Settings

`PUT /settings`: JSON `{hospitalName,department}`. Hospital name is required, each value at most 200 characters. Unknown properties are rejected. Returns persisted settings. Identity, language, and safety settings cannot be changed through this write contract. Does not invoke cloud services.

## Extraction

`POST /extract-discharge`: multipart form with exactly one `file` OR one `textInput`.

- File: PDF, PNG, JPEG only; signature must match MIME; one file, 15 MiB maximum.
- Text field: nonempty string, at most 32,000 characters. The local extraction stage further limits normalized text to 12,000 characters and checks the model token budget.
- PDFs: 20-page cap. Source text must have at least 30 characters and usable quality.
- Concurrent extraction is rejected with 429 rather than queued.

Returns `StructuredDischargeInfo`: patient fields, diagnosis/procedure/care arrays, medications, allergies, appointments, warnings/emergency instructions, additional notes, extraction metadata and available source excerpts. Fields use FOUND/MISSING/UNCLEAR; matching evidence never promotes UNCLEAR automatically. Medication context, conflicting allergy statements and recognized source meta-instructions can downgrade fields.

The operation uses local PDF/OCR and Qwen. It does not persist an original file or a draft and has no Gemini fallback. Model/native/OCR assets may require setup/first-use downloads. Errors do not establish a successful extraction.

Response extraction metadata includes `latency.sourceMs`, `modelMs`, `evidenceMs` and `totalMs`. Source timing covers PDF parsing or scanned-page OCR plus validation after multipart receipt; model timing includes initialization/context setup as well as inference. The client's upload/network time is additional. These stage measurements distinguish slow PDF reading from slow local inference. Scanned PDF pages share one per-document OCR worker, which is terminated before returning; a failed page rejects the extraction instead of returning a successful partial source.

## Verified data and report schemas

`AuthoritativeDischargeData` includes `patient` (name, patientId, age, gender), `diagnosis`, `procedures`, `medications`, `allergies`, `diet`, `activityRestrictions`, `woundCare`, `followUp`, `warningSigns`, `emergencyInstructions`, `additionalNotes`, and `isConfirmedAuthoritative:true`.

Simple fields are `{value,status}`; arrays permit at most 100 items. Each field value is limited to 2,000 characters. FOUND requires a nonempty value; MISSING requires an empty value. UNCLEAR is rejected at confirmation. Patient name and ID are required and limited to 200 characters. Medication names are required; dosage/frequency/duration/instructions each have a corresponding status and the medication must be confirmed FOUND. Appointments contain provider/date/time/location/instructions and a status. Verifier identity/time are assigned by the server; incoming attribution is not trusted. The schema has no independent route or medication-lifecycle field.

`GeneratedReport` contains a nonempty ID, positive safe-integer version, `language:"en"`, patientName/patientId, title, and eight string sections: summary, diagnosisAndProcedures, medicationInstructions, dietAndActivity, woundCareAndHygiene, followUpAppointments, warningSignsAndEmergency, additionalInstructions. Each section is limited to 20,000 characters; title to 500; patient fields to 200. The server reconstructs this object and owns persisted IDs/version/time; rawMarkdown is not trusted.

Appointments also preserve optional providerStatus/dateStatus/timeStatus/locationStatus/instructionsStatus. Changing instructions cannot clear an uncertain date, even if the aggregate status is forged FOUND. Legacy rows without substatuses are reconstructed conservatively from their aggregate status. The date editor preserves source formats as text instead of silently hiding non-ISO dates.

## Generate, audit, rewrite

| Method / path | JSON request | Response | Persistence / external use |
| --- | --- | --- | --- |
| POST `/generate-instructions` | `{verifiedData,language?:"en"}` | `{report,auditResult}` | No save; initial report uses local templates; audit may use Gemini only if explicitly requested/enabled |
| POST `/audit-instructions` | `{verifiedData,report}` | `AuditResult` | No save; optional enabled cloud audit |
| POST `/validate-instructions` | Same as audit | `AuditResult` | Alias |
| POST `/regenerate-section` | `{verifiedData,report,sectionKey,instruction}` | `{updatedSectionText}` | Requires cloud and generation flags, credentials/model; instruction nonempty up to 2,000 characters; no save/approval; cloud receives verified data and section content |

`AuditResult` contains policyVersion, reportVersion, findings, categorySummaries, overallStatus, recommendation, coverageNote, cloudAuditStatus and counts. An unavailable requested cloud audit is not PASS and blocks subsequent approval. A preview audit does not update the saved record; save the report to recompute its authoritative audit.

## Save and version

`POST /discharge-documents`: JSON `{verifiedData,generatedReport,hospitalInfo}` only. `hospitalInfo` accepts required name and department. Returns 201 with the saved `DischargeDocument`. The backend assigns a UUID, version 1, fresh audit and timestamps; no client approval/audit/history properties are accepted.

`PUT /discharge-documents/:id`: same body, plus `If-Match: <currentVersion>` header. Missing/wrong version returns 409. Returns 200 with the next saved version, recomputed audit and cleared approval. The repository rechecks the version within a transaction; overlapping same-version writes cannot both succeed. Every write appends an event. Critical audits are saved as NEEDS_REVIEW; other saved reports are AUDITED and still require acknowledgment.

## Approval

`POST /approve-instructions` or `/approve-document`:

```json
{"documentId":"saved-id","reportVersion":1,"clinicianReviewConfirmed":true,"signatureNote":"Optional review note"}
```

Requires the current numeric version, saved verified data/report/current audit, no critical audit and no unavailable requested cloud audit. Note is at most 2,000 characters. Returns `{success:true,document}`. The server supplies approver identity and time. Unknown attribution supplied by a client is ignored, not trusted. This is an acknowledgment, not a cryptographic signature.

The saved audit must also match the current audit-policy version; legacy/missing policies return 409 and require save/re-audit/review. Replaying approval of an already-approved current version returns its existing approval unchanged.

## Approved PDF

`POST /precheck-approved-pdf`: JSON `{documentId}` only, returns `{ok:true}` after checking the current saved approval/audit/version. No PDF or record is persisted.

`POST /generate-approved-pdf`: JSON or URL-encoded `{documentId}` only. Returns a PDF attachment with Content-Type `application/pdf`, Content-Disposition filename and Content-Length. Any additional request property is rejected. Eligibility is checked again on the final request; the renderer also validates the supplied saved snapshot. All eight reviewed report sections are rendered in addition to verified structured tables. A precheck cannot guarantee that a later request will remain eligible or that the browser has completed a download.
