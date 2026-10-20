# Qwen loading, extraction and verification fixes

Baseline: `aa63a4069d0db3abdbfc86e58d7386eff3512459`, 20 October 2026. This follow-up investigates the screenshots showing NOT_LOADED during/after extraction and nearly every extracted value UNCLEAR. Checks used synthetic records and isolated databases; no real clinical record or credential contents were read.

## Confirmed causes and fixes

| Finding | Evidence | Result |
| --- | --- | --- |
| QWEN-01: Stale engine badge | Sidebar fetched once on mount/manual click; lazy loading then changed server state | Poll every two seconds; distinguish loads-on-first-use, loading, extracting, ready, missing model and error |
| QWEN-02: Missing model status objects | One baseline synthetic response had 16 primitive fields and no status objects | Retain original local proposals; add a schema-constrained local read; reconcile before evidence validation |
| QWEN-03: Quoted medication heading | A quote included `Medications:` and the following drug line; full-source match passed but line-scoped check failed | Check the value beside its own medication and the quote against full source; failing regression now passes |
| QWEN-04: Dose spacing | `500mg` did not match `500 mg` | Normalize spacing without converting units; mg/mcg mismatches remain UNCLEAR |
| QWEN-05: Nonempty MISSING values | Model returned a patient value labelled MISSING, creating a later server confirmation failure | Inconsistent nonempty values become reviewable UNCLEAR; empty values remain MISSING |
| QWEN-06: Wrong source role | Diagnosis/patient/allergy/attending labels supplied matching text in the wrong category | Opposing role labels cannot validate active medication, allergy or follow-up assertions; conservative pattern checks, not a clinical ontology |
| QWEN-07: Inequality loss | Normalization erased `<`/`>`, admitting the opposite medication hold condition | Preserve direction and equality, including Unicode equivalent operators; failing regression now passes |
| QWEN-08: No unchanged-value review action | Correct UNCLEAR values could only be confirmed by editing text | Per-field Mark reviewed action, with dirty-state/approval invalidation; empty legacy appointment fields display MISSING |

## Local processing and the API question

The browser calls the authenticated localhost HTTP API `/api/extract-discharge`. The backend runs the installed Qwen weights through node-llama-cpp. There is no external extraction API or cloud extraction fallback. Gemini remains a separate optional feature for explicitly enabled operations. Tests observed actual Vulkan and zero Gemini calls.

Qwen is intentionally initialized on the first extraction. An idle unloaded model is not evidence that a cloud API was used. Status now reports loading while weights are verified/initialized and extracting during inference. The sidebar updates automatically; failures have an error state.

## Final extraction protocol

Version: `local-extraction-v7-preserve-proposals`. The original v2 prompt text is retained; an automated comparison checked that it is unchanged. Weights, dependency versions and clinical acceptance thresholds were not changed.

1. A local proposal read retains the existing 2,048-token output allowance and parsing/repair behavior.
2. A separate read in a reset chat context uses JSON-schema grammar, requiring value/status/evidence objects and independent medication/appointment fields, with a 4,096-token output allowance.
3. Reconciliation retains unmatched proposals as UNCLEAR. Conflicting values retain the original proposal for review. A structured value can supply a status when the values agree. Composite medication/appointment fields are realigned only when all proposed values are covered by the structured fields. Duplicate entries are retained rather than silently removed. Explicit model UNCLEAR markers remain conservative across matching values.
4. Source-evidence checks still run before the UI response. Text agreement between two reads is not proof of medical meaning or independent verification. Both reads use the same model and can share errors.
5. Clinician verification remains authoritative. Invalid/truncated reads fail rather than silently returning partial successful extraction. The 8,192-token context and tokenizer admission guard remain; long sources may need splitting. One shared 120-second prompt-stage deadline covers both reads, excluding cold loading/source/OCR/context setup.

Raw evaluation scores refer to the reconciled canonical output before evidence filtering, not original neural response text. No raw source or predictions are committed. Explicit uncertainty is retained by normalized value across fields; unrelated equal values can therefore receive extra review flags. This is conservative, not a certainty estimate.

## Frozen synthetic development results

All complete comparisons use the same 31 author-labelled cases and 237 labelled fields. Labels were not rewritten. These are in-sample development results, not clinical accuracy, independent hold-out evidence, or qualified clinical endorsement.

| Version | Value-only agreement | Value/status agreement | Missing predicted fields | Disposition |
| --- | --- | --- | --- | --- |
| Historical v2 | 199/237 (83.97%) | 94/237 (39.66%) | 30 | Earlier published baseline |
| v3 long constrained instructions | 155/237 (65.40%) | 148/237 (62.45%) | 79 | Rejected omission regression |
| v4 compact constrained instructions | 174/237 (73.42%) | 135/237 (56.96%) | 53 | Rejected omission/allergy-state regressions |
| v5 focused passes | Partial: 3 recorded cases | Partial | Not comparable | Stopped following diagnosis-as-medication failure |
| v6 original prompt, structured output alone | 148/237 (62.45%) | 143/237 (60.34%) | 85 | Rejected omission regression |
| **Final v7: retained proposals plus structured read** | **201/237 (84.81%)** | **163/237 (68.78%)** | **25** | Software fix with ongoing clinical limitations |

Final execution: 31/31 completed, zero execution errors. After evidence checks: TP=67, FP=7, FN=56; strict asserted-fact precision 67/74 (90.54%), recall 67/123 (54.47%), F1=0.6802. These are exact-label proxies; benign paraphrases and identity-key mismatches can count as errors. They are not adjudicated hallucination rates. Value-only agreement includes explicitly empty MISSING labels.

Allergy-state agreement is 26/31 (83.87%), compared with 27/31 in the earlier baseline. Labelled incorrect-certainty count after evidence checks is zero, while seven unmatched assertions remain; zero on one counter is not a clinical safety guarantee. Additional notes remain omitted in the dedicated model case despite working schema transport and manual editor support. Important omissions, role errors and review burden remain.

Observed extraction wall time on this workstation: minimum 11,016 ms, median 19,766 ms, maximum 26,715 ms; summed 578,587 ms. The first case includes process-cold setup, not isolated cold disk caches. Two reads add work; no performance guarantee or controlled speed comparison is claimed. Existing token throughput and heap/VRAM fields remain approximate snapshots, not exact tokenizer throughput, peaks or leak measurements.

Machine-readable metadata, source fingerprints, full component denominators and rejected-trial summaries: [qwen-schema-evaluation.json](qwen-schema-evaluation.json). Final scoring replay preserved the recorded predictions and reproduced the executed stages. The reconciliation implementation fingerprint was captured during the run; publication adds one explanatory comment, with byte recovery verified and both fingerprints recorded.

## Verification

| Check | Actual result |
| --- | --- |
| TypeScript | PASS |
| Fast security/persistence/clinical/scoring regressions | 38/38 PASS |
| Existing PDF and architecture checks | 18 PDF checks and architecture PASS |
| Native model/OCR suite | 9/9 PASS, including actual three-medication extraction, independent schedules/duration, EXTRACTING/READY states and zero Gemini calls |
| Service integration acceptance | 18/18 PASS, zero Gemini calls measured |
| Selected pipeline blocking cases | 9/9 PASS; eight PDF section markers |
| Build and production/development startup | PASS: auth, private-file protection, generation/save, approval, native-form PDF and persistence across restart |
| Browser fixture | Explicitly reviewed unchanged patient name; medication remained UNCLEAR; reviewed medication; proceeded to generation with old approval disabled; generated/saved new version |
| Browser status | LOADS ON FIRST USE observed; backend inference states checked separately in native suite |
| Remote CI | Handoff supplies the actual publication result; no outcome invented in this pre-publication report |

The [synthetic UI screenshot](../screenshots/qwen-schema-reviewed-synthetic.png) shows the fixture after per-field review reached generation. It is UI evidence; model behavior was tested separately. Full browser file-upload/download completion, formal accessibility, live Gemini, other hardware and clinical review were not comprehensively verified in this follow-up.

## Use the update

Keep any unsaved source text, restart with stop.bat/start.bat if needed, reload, and run a fresh extraction. Existing saved records are not rewritten by the model change. Compare every value with the original source, including FOUND fields. Use Mark reviewed only for an unchanged value you checked; correct field placement or remove unsupported entries. Missing information must not be invented. Original files still need to be retained separately.

The engineering workflow is improved; clinical readiness remains unestablished. Obtain independent qualified review and a frozen hold-out study under agreed clinical acceptance criteria before any real-patient use. Human review cannot be replaced by these software tests or synthetic percentages.
