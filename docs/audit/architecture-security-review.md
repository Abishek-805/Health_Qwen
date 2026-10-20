# Architecture and security review

Baseline: `374b2d4`, independently inspected 2026-10-20. Findings describe synthetic reproductions, not real patient records. Confidence is Confirmed unless stated otherwise. Baseline TypeScript, fast tests, build and dependency audit passed; the new targeted regression suite initially passed 1/10 and failed 9/10. An existing passing suite did not establish coverage of these defects.

| ID | Severity / class | File and observed behavior | Impact / reproduction | Remediation and regression | Disposition |
| --- | --- | --- | --- | --- | --- |
| CQ-01 | High / software defect | `sourceEvidenceValidator.validateSourceEvidence`: matching text promotes UNCLEAR to FOUND | Ambiguous model output loses uncertainty; matching-name regression | Preserve uncertainty; require medication-local evidence; targeted evidence tests | Fixed; targeted regression PASS |
| CQ-02 | High / software defect | Same validator checks medication values anywhere in the source | Another medication's 500 mg validates an unknown dose; stopped/historical text looks active | Conservative medication-context checks, preserve questionable entries as UNCLEAR; unrelated-dose/stopped/historical tests | Fixed; targeted regression PASS |
| CQ-03 | High / software defect | `geminiService.buildFallbackReport` fills absent frequency/duration with prescription directions | Unsupported wording appears in report | Explicit Not specified labels; missing schedule regression | Fixed; targeted regression PASS |
| CQ-04 | High / software defect | `deterministicAudit` global numeric matching and first-line schedules | A second valid medicine's units cause false critical result; a second contradictory schedule and negation escape | Scope checks to medication clauses and inspect all occurrences; multi-unit/conflict regressions | Fixed; targeted regression PASS |
| CQ-05 | High / software defect | `Step4Audit`, `Step5Review`, `serverPdfGenerator`: empty allergy list becomes NKDA | Absence is presented as a negative clinical assertion | Explicit unknown/not provided state; React render and parsed-PDF regression | Fixed; targeted regression PASS |
| CQ-06 | High / software defect | `serverPdfGenerator`: medication table replaces reviewed medication report prose | Approved medication section edits disappear from PDF; synthetic marker test | Render saved medication prose as well as verified table; parsed-PDF regression | Fixed; targeted regression PASS |
| CQ-07 | High / software defect | `deterministicAudit`: warning headings hide omitted source warning | Omission not detected when headings remain | Check verified warning content; empty-headings regression | Fixed; targeted regression PASS |
| CQ-08 | Medium / software defect | `serverPdfGenerator`: current date labelled DISCHARGE DATE | PDF creates a discharge date absent from verified source | Label output as PDF creation date; parsed-PDF regression | Fixed; targeted regression PASS |
| CQ-09 | Medium / workflow defect | `Step6Approve`: form submission immediately displays download success | Browser/server final download failure may look successful | State download requested, not completion; test rendered feedback | Fixed; browser/render checks and limits recorded below |
| CQ-10 | High / workflow defect | `App` / wizard: navigation or new-document action can retain/discard local state; reverified source leaves old saved document eligible in step navigation | Unsaved changes lost or old report can be selected after source edits | Navigation guard, keyed document sessions, clear old saved eligibility when source changes; UI regression | Fixed; browser/render checks and limits recorded below |

## Verified existing boundaries

Current routes authenticate except health; local host and origin checks, server-owned verifier/approver identities, writable-field reconstruction, If-Match version checks, transaction rollback, approval invalidation, final saved-ID PDF checks and append-only history triggers exist. Existing tests exercise authentication, hostile hosts/origins, forged metadata, stale versions, edits after approval, critical blocks, backup/restore into a new file and no-overwrite restore. Cloud-disabled regression passed before fixes: no fetch calls for disabled client/status/generation/audit paths. No demonstrated authentication bypass was found in this inspection; that is not an exhaustive penetration-test claim.

## Open design/validation limits

| ID | Severity / confidence / class | Evidence and containment | Further work |
| --- | --- | --- | --- |
| LIM-01 | High / Confirmed / clinical validation gap | Small local model, lexical evidence and pattern audits cannot establish clinical meaning; no clinician benchmark endorsement | Fixed synthetic protocol and qualified review; no clinical-readiness claim |
| LIM-02 | Medium / Confirmed / operational | One process/extraction, synchronous SQLite, full document scans and embedded history growth | Single-workstation scope; pagination/retention only when measured need justifies it |
| LIM-03 | Medium / Confirmed / privacy | Local SQLite/backups and convenience login are not application-encrypted; event triggers are not administrator-proof | Local OS/disk protection; secure backups; no public/LAN hosting |
| LIM-04 | Medium / Confirmed / resource limit | Prompt deadline excludes cold model loading; OCR deadline excludes worker initialization/rendering; image dimensions not bounded by file bytes | No uncontrolled resource tests; document limits; sandbox/global processing budget remains future hardening |
| LIM-05 | Medium / Confirmed / provenance | Original files not retained; verified reconstruction drops extraction notes/evidence metadata | Keep source separately; approval acknowledgment required; source archive out of scope |
| LIM-06 | Medium / Needs verification / accessibility | Labels exist but no formal keyboard/screen-reader/contrast assessment | Record browser checks separately; do not claim WCAG compliance |
| LIM-07 | Low / Confirmed / operational | Schema bootstrap is version-1 initialization, not a migration framework | Reject newer versions; backup before schema changes; migration work requires an actual schema change |

See the progress log and final verification report for post-remediation outcomes. Regression names in `server/tests/test-clinical-regression.ts` provide repeatable reproductions without exposing clinical records.

## Additional confirmed findings and final dispositions

| ID | Severity / class | Reproduction / impact | Remediation / current disposition |
| --- | --- | --- | --- |
| CQ-11 | High / software defect | Source footer instructions to invent an allergy were accepted as matching evidence; adversarial regression failed before fix | Recognized meta-instruction evidence becomes UNCLEAR. Regression passes; unknown injection variants remain an open clinical/security limit. |
| CQ-12 | High / software defect | Conflicting negative/positive allergy lines validated the positive output as certain | Conservative source-line conflict detection; synthetic regression passes. Omitted conflict evidence still requires source review. |
| CQ-13 | High / software defect | Malformed/missing model field status was coerced to FOUND | Malformed structures remain UNCLEAR; coercion regressions pass. Actual model run shows substantial review burden; no prompt tuning used to conceal it. |
| CQ-14 | Medium / software defect | Replayed approval rewrote its note/timestamp on the same report version; HTTP regression failed | Idempotent success returns the existing approval without a new write; replay regression passes. |
| CQ-15 | High / workflow defect | Adding an appointment populated today's date and 10:00 AM absent from source | New appointment starts empty/MISSING; source edits are guarded and invalidate local old-report eligibility. Browser verification status is recorded in final report. |
| CQ-16 | Medium / workflow/privacy | Extracted excerpts existed in response fields but were not visible; diagnostics exposed absolute model paths/raw provider errors | Excerpts displayed, model status path made relative, routine native/cloud errors sanitized. Render regression passes; no full source archive is claimed. |

The final PDF-preservation fix for CQ-06 also covers follow-up prose and the previously absent additional-instructions section. A nine-case labelled audit evaluator plus eight-marker parsed-PDF check passed. A direct renderer guard now rejects stale/unapproved snapshots even outside the HTTP path.

CQ-09 uses requested-state wording because a native form cannot prove final download completion. CQ-10 adds keyed new-document sessions and unsaved source/report guards, including old-report navigation protection after source edits. Actual browser observations and any blocked checks are reported separately; no complete accessibility or browser-suite claim is made.

## Residual clinical-readiness blocker

Final real-model synthetic evaluation completed 31/31, but exact value-and-status agreement is 94/237; strict value agreement is 199/237. Many normalized fields remain UNCLEAR; their schema-versus-model-uncertainty causes were not separately quantified. Typed medication errors, care/warning omissions and allergy-state failures remain. These are confirmed benchmark/clinical-validation gaps, contained by manual source verification, uncertainty rejection before confirmation, critical/unavailable audit gates and explicit prohibition on clinical-readiness claims. They are not reported as solved by regexes or by the passing selected-rule benchmark. See the fixed corpus, machine-readable results and qualified-review protocol.
| Additional ID | Severity / confidence | Confirmed reproduction | Disposition |
| --- | --- | --- | --- |
| CQ-17 | High / Confirmed | Six long clinical text/table fields exceeded printable PDF bounds; coordinate regression failed | Fixed with per-line pagination and long-field fallbacks; coordinate regression passes. Ordinary short tables/boxes retained. Extreme metadata/font visual coverage remains unverified. |
| CQ-18 | High / Confirmed | An approved snapshot without an audit-policy version still exported under newer rules; renderer regression failed | Saved policy version required by approval, precheck, final PDF and renderer. Legacy HTTP fixtures return 409; old records require fresh save/audit/review. No destructive migration. |
| CQ-19 | High / Confirmed by code | Returning from confirmed data to verification restored older extracted values; leaving edited verification could unmount unsaved fields | Confirmed values retained locally; source-navigation rule blocks destructive step transitions and old approval. Rule regression passes; full browser transitions remain explicitly not verified. |

Policy freshness regression now covers renderer and actual HTTP approval/precheck/download of a legacy fixture (409). Current policy is 2026-10-20.4. Updated dependency snapshot remains zero known advisories. No destructive data migration was performed.

## Final boundary and regression findings

| ID | Severity / class | Evidence | Disposition |
| --- | --- | --- | --- |
| CQ-20 | High / interim remediation regression | The initial context guard falsely blocked a verified Stop after 5 days instruction; targeted regression failed | Fixed: inspect novel context after removing the exact verified instruction, while retaining changed/added negation checks. |
| CQ-21 | High / software defect plus remaining model gap | Canonical extraction/mapping always dropped additional notes; transport regression failed | Fixed schema/normalization/evidence/mapping/template preservation; one versioned prompt schema change. Actual model still omitted the dedicated case; retained as a clinical-readiness blocker. |
| CQ-22 | High / software defect | Editing appointment instructions cleared aggregate uncertainty despite an uncertain date; helper regression failed; ISO-only input hid non-ISO dates | Per-field statuses now survive mapping/editing/server validation; server rejects masked UNCLEAR. Source date rendered as text; helper/validation/render regressions pass. |
| CQ-23 | High / software defect | ASCII filtering converted source 500 microgram glyph units into text supporting 500 g; regression failed | Microgram glyphs canonicalized to mcg for evidence; dose audit supports both glyph forms without false blocking. Regression passes. Other complex dose semantics remain explicit clinical coverage limits. |
| CQ-24 | High / privacy configuration defect | Authenticated Vite request returned a synthetic private runtime sentinel, proving a non-API file-serving path; no real secrets queried | Vite deny rules protect runtime/data/models, SQLite/DB/backup and default secret patterns. Direct/encoded/@fs synthetic probes return 403 in dev; production does not disclose bytes. Auth/save/approve/PDF/restart still pass. |

Current audit policy: 2026-10-20.4. The final corpus is synthetic-discharge-v2 (31 cases) with one intentional notes-schema prompt revision; no score-target tuning. Remaining uncertainty is a clinical-validation gate, not an assertion that all rule categories are clinically correct. Complex scientific/range/qualifier dose meanings and provider/date associations require source review; local quantity/string checks are incomplete and are not a typed clinical proof system.
