# Clinical evaluation protocol

> Audit snapshot from commit aa63a40. The subsequent Qwen schema/status and verification-control investigation is recorded in [the follow-up report](audit/qwen-schema-fix.md). Previous model scores below describe prompt v2, not the revised v7 two-read protocol.

## Purpose, governance and limits

This framework measures software behavior against versioned synthetic labels. It does not establish clinical validity, professional endorsement, regulatory compliance or suitability for unsupervised use. No real patient documents or live clinical cloud requests are used. Human clinical review has not occurred.

`server/evaluation/fixtures.ts` defines 31 author-written cases in `synthetic-discharge-v2`. Each has an ID, source, expected canonical facts/statuses, pitfalls, severity and an explicit human-review requirement. Labels are independent of predictions. All expected clinical facts come from the synthetic source. The corpus covers role confusion, missing identity, decimal doses, multiple drugs, missing schedules, route text, historical/stopped/negated medications, conflicts, unrelated numbers, positive/negative/missing/unknown/conflicting allergies, absolute/relative follow-up, care/warnings, broken wrapping, duplicates, truncation and source prompt injection.

The corpus is small and constructed for defects, not a representative clinical population. Units and synthetic schedules are extraction fixtures, not treatment advice. Route is retained in instructions because the current domain lacks a route field. Typed medication lifecycle and full conflict resolution remain incomplete. Additional-notes schema/transport preservation is fixed, but the model still omitted that dedicated case. The corpus has no clinician-approved accuracy target. Version 2 adds positive demographics, benign headers/footers, OCR-character ambiguity, valid longer input, procedure-versus-care, medication changes, ambiguous schedules and additional-notes coverage; original case facts were not revised to fit predictions.

Ground-truth changes require a written source-based rationale, independent review and a dataset version change. Do not revise labels to match a model result. Freeze a hold-out corpus before model/prompt tuning. One explicit prompt schema change added additionalNotes (local-extraction-v2-additional-notes) and was evaluated against frozen case facts. No repeated prompt tuning for a target score occurred.

## Stages and execution

1. **Source/OCR:** `npm run evaluate:ocr` compares a rendered synthetic page with its known text. Existing suites also cover digital PDFs and image OCR. One rendered page is not an OCR population benchmark.
2. **Model:** `npm run evaluate:model` executes the pinned Qwen locally and records normalized canonical output.
3. **Evidence:** the same predictions pass through the actual evidence validator; raw and validated scores remain separate.
4. **Clinician verification:** not automated or simulated as real approval. Complete the human review template separately.
5. **Templates:** deterministic regressions compare output with synthetic verified data, including absent schedules/allergies.
6. **Audit:** `npm run evaluate:pipeline` runs nine labelled critical-category perturbations. These measure the selected rules, not general medical reasoning.
7. **Approval:** fast HTTP tests and production smoke exercise current versions, stale/concurrent writes, replay, invalidation and blocking.
8. **PDF:** parsed-text checks and eight unique section markers test preservation of the saved reviewed report.

Model results are checkpointed after each case in `.runtime/clinical-evaluation.json`; pipeline/OCR results go to `.runtime/pipeline-evaluation.json`. Both are ignored. The evaluator accepts imported synthetic predictions but never replaces absent outputs with expected data. A model error/missing prediction remains an attempted case with all labelled fields in its denominator. Use `--limit N` only for an explicitly partial run; report total/requested/completed counts.

Record model hash/revision, repository revision and dirty-state qualification, source/prompt fingerprint, package/runtime versions, actual backend, OS/CPU/RAM, context/output budget, temperature, dataset version, execution date, errors and latency. The seed is null because the current inference call does not specify one; repeat runs are not promised bit-identical. GPU memory snapshots and JavaScript heap deltas are not peak native/process memory or utilization measurements.

## Metric definitions

Matching lowercases and collapses whitespace. It does not silently convert units, adjudicate paraphrases, or erase punctuation. Medication and appointment groups are keyed by normalized name/provider; duplicates keep occurrence indices rather than being discarded. Name errors therefore affect associated field matching. All scores are strict label-based proxies requiring human interpretation.

| Metric | Definition / denominator |
| --- | --- |
| Exact field/status accuracy | Equal normalized value AND status / all labelled fields, including MISSING fields |
| Strict value-only agreement | Equal normalized value / all labelled fields, including explicitly empty MISSING fields; certainty and clinical adjudication are separate |
| Missing predictions | Labelled field paths absent from output; never silently skipped |
| Fact precision | Correct asserted FOUND facts / all predicted nonempty FOUND facts |
| Fact recall | Correct asserted FOUND facts / all labelled nonempty FOUND facts |
| F1 | `2TP / (2TP+FP+FN)` |
| Medication component accuracy | Exact name, dose+unit, frequency or duration fields / labelled fields in that component |
| Allergy field/state accuracy | Labelled allergy field value/status matches; no entries means missing, not an explicit negative |
| Follow-up accuracy | Exact labelled appointment subfields/statuses |
| Unmatched assertion proxy | FP / predicted FOUND facts; this includes benign formatting/paraphrase mismatches and is NOT an adjudicated hallucination rate |
| Labelled omission proxy | FN / labelled FOUND facts; clinical importance requires severity adjudication |
| Incorrect certainty count | Predicted FOUND where the corresponding label is UNCLEAR or MISSING; identity-key mismatches are also separately counted as unmatched facts |
| UNCLEAR precision / recall | Correct UNCLEAR paths / predicted UNCLEAR paths, and / labelled UNCLEAR paths |
| Evidence-supported rate | Raw asserted fields retained FOUND by the actual validator / raw asserted fields; textual support is not clinical truth |
| Critical-category audit precision / recall | Predicted critical categories matching complete selected-case category labels / all predicted or all labelled critical categories |
| Blocking verdict correctness | Correct critical/noncritical audit verdicts / nine selected rule cases; HTTP enforcement is tested separately |
| PDF section preservation | Saved unique section markers found in parsed PDF / eight sections |
| OCR CER / WER | Levenshtein character/word edit distance / known normalized source characters/words |
| Latency | Wall time per extraction; first case includes cold model setup; prompt metrics are reported separately |

Zero denominators produce JSON null, never invented 0%/100%. Per-case component numerators/denominators are retained. No measurement is reported for clinician correctness, real-world omission/hallucination rates, peak native memory, GPU utilization or clinical acceptance.

## Error taxonomy and adjudication

Record wrong patient/role; wrong or omitted drug; wrong dose/unit/route/frequency/duration; historical/negated medication presented as active; incorrect allergy state; missing warning/emergency/follow-up; unsupported instruction; incorrect certainty; invalid source evidence; OCR error; malformed model JSON; stale approval/PDF; and operational timeout/error.

Review the source, prediction, evidence-filtered fields, template, findings, saved record and PDF separately to locate the origin. Preserve both false positives and false negatives. An invented dose, incorrect allergy state, wrong identity or missed serious warning requires a severity assessment and blocks any claim of clinical readiness pending qualified disposition. Do not equate an audit PASS on selected patterns with a clinical PASS.

## Human review

Use [clinical-review-template.md](clinical-review-template.md). Qualified reviewers should independently annotate cases before seeing predictions, reconcile disagreements, record material omissions/unsupported instructions, and check PDF consistency. Record reviewer role/date and dataset version without inventing endorsements. De-identified clinical data requires separate governance; do not place it in the committed synthetic corpus.

## Release gates

| Gate | Evidence needed | Current policy |
| --- | --- | --- |
| Software/security | Relevant deterministic tests, trust boundaries, regressions | No unresolved demonstrated bypass or hidden failing test |
| Recovery | Synthetic consistent backup, restore/no-overwrite, persisted restart | Required software evidence |
| Extraction | Fixed corpus, component metrics, source-based error review | Numeric thresholds pending clinical stakeholder approval |
| Unsupported assertions/important omissions | Qualified severity adjudication, unresolved high-risk case disposition | Clinical-readiness claim blocked while material cases remain |
| Audit coverage | Measured rule cases and visible NOT_EVALUATED/unavailable states | Never claim comprehensive clinical coverage |
| Approval/PDF | Exact saved version, edit invalidation, replay/stale checks, all-section PDF | Required software evidence |
| Accessibility | Keyboard, focus, contrast and assistive-technology assessment | Formal assessment pending; no WCAG claim |
| Operations | Local-only startup, actual backend, resource/recovery limits | Document platform-specific gaps |

These are proposed review gates, not an approved medical deployment policy. Only the appropriate stakeholders can accept clinical thresholds and residual clinical risks. Current measured results and their limitations are in [the final report](audit/final-verification-report.md).

Existing runtime token-count/throughput fields use a character-based approximation; exact tokenizer throughput was not measured. The actual context admission check uses the model tokenizer. Uncertainty/schema causes were not separately quantified from the normalized canonical outputs. Scientific notation, dose qualifiers and complex clinical dose expressions are not comprehensively parsed by the selected local rules.
