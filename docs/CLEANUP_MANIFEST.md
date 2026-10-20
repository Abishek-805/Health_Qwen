> Historical record from the original rebuild. The current implementation and guarantees are described in AUDIT_REPORT.md.

# CLEANUP MANIFEST & DEPENDENCY AUDIT

This manifest documents the dependency and file audit conducted during the clean local clinical extraction rebuild.

---

## File Audit & Status

| File Path / Component | Status | Action Taken | Reason |
|---|---|---|---|
| `server/services/localClinicalExtractionService.ts` | **ACTIVE** | **UPDATED & RETAINED** | Single authoritative local clinical extraction engine using Qwen2.5-1.5B Q4_K_M GGUF via `node-llama-cpp`. Contains structured `followUpAppointments` sub-schema prompt rules, `getQwenStatus` status exporter, and defensive canonical normalization. |
| `server/routes/api.ts` | **ACTIVE** | **UPDATED & RETAINED** | Route `POST /api/extract-discharge` calls local source extraction, local Qwen extraction, and evidence validation (0 Gemini API calls). Added `GET /api/extraction-status` endpoint. |
| `src/components/wizard/Step1Upload.tsx` | **ACTIVE** | **UPDATED & RETAINED** | Updated status stage messages and labels from "Gemini" to "Local Qwen2.5 engine". |
| `src/components/wizard/Step3Generate.tsx` | **ACTIVE** | **UPDATED & RETAINED** | Step 3 UI cleaned up to accurately present English as the supported language ("Step 3 — AI Discharge Instructions"). Multilingual cards and target language selector removed. |
| `src/components/wizard/Step5Review.tsx` | **ACTIVE** | **UPDATED & RETAINED** | Replaced Gemini UI references with generic AI engine references. |
| `src/components/common/AiStatusIndicator.tsx` | **ACTIVE** | **UPDATED & RETAINED** | Points to `/api/extraction-status` and displays Qwen local engine status (engine name, device CUDA/CPU) instead of Gemini status. |
| `src/components/layout/Sidebar.tsx` | **ACTIVE** | **UPDATED & RETAINED** | Updated comment from Gemini Engine Status to Local AI Engine Status. |
| `server/services/documentSourceService.ts` | **ACTIVE** | **RETAINED** | Handles digital PDF parsing, local OCR, and text normalization with sequential GPU memory cleanup. |
| `server/services/textNormalizationService.ts` | **ACTIVE** | **RETAINED** | Safe text normalization preserving original source text for evidence validation. |
| `server/services/sourceEvidenceValidator.ts` | **ACTIVE** | **RETAINED** | Deterministically verifies extracted evidence against raw source text (0 LLM calls). |
| `server/audit/hybridAudit.ts` | **ACTIVE** | **RETAINED** | 18-Category local safety audit engine. |
| `server/services/clinicalExtractionService.ts` | **LEGACY / UNUSED** | **RETAINED (Unused helper export)** | Cloud Gemini extraction function `extractClinicalDataGemini()` remains in source but is **NOT called by any server route**. `mapCanonicalToStructured()` is retained as the structured converter. |

---

## Gemini API Removal & Execution Guarantee
- Normal document extraction workflow (`POST /api/extract-discharge`): **0 Gemini API calls**.
- Handout report generation (`POST /api/generate-instructions`): **0 Gemini API calls** (runs local template engine).
- Safety auditing (`POST /api/audit-instructions`): **0 Gemini API calls**.
- Extraction engine: **Qwen2.5-1.5B local GGUF model (`qwen2.5-1.5b-local`)**.
