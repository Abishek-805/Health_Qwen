# Remediation roadmap

Effort estimates are engineering estimates, not delivery guarantees. Order follows confirmed risk and dependencies. Preserve the existing local architecture.

| Phase | Work / finding IDs | Depends on | Acceptance criteria | Estimated effort | Risk |
| --- | --- | --- | --- | --- | --- |
| 0 | Record baseline, preserve prior design document, run safe baseline | None | Actual command results and resumable progress recorded | 0.5 day | Tests must isolate databases/cloud |
| 1 | CQ-01/02/05/06: uncertainty, evidence, allergy assertions, PDF integrity | Reproductions | Matching text cannot remove uncertainty; missing allergy stays unknown; reviewed medication prose survives PDF | 1–2 days | Conservative checks may increase manual review |
| 2 | Verify transactions/recovery, lifecycle, production boot | Baseline | Temporary-db backup/restore/no-overwrite, stale versions, local production health/auth and Windows ownership pass | 0.5–1 day | Do not alter user database or kill unrelated processes |
| 3 | CQ-03/04/07/08: templates, medication scope, warnings, output date | Fixed synthetic cases | Targeted regressions pass without weakening existing assertions | 1–2 days | Pattern rules remain incomplete clinical checks |
| 4 | Versioned synthetic corpus, evaluator, metrics and model benchmark | Stable expectations | Ground truth separate; missing outputs counted; zero denominators null; actual model metadata and errors recorded | 1–2 days | No numeric clinical acceptance target without qualified agreement |
| 5 | CQ-09/10, technical docs and human review template | API invariants | Honest download state, protected report edits, independent sessions, actual design/API/ops/privacy docs | 1 day | Browser behavior requires separate observation |
| 6 | Final regression, build, model/OCR, dependency and repository checks | Prior phases | Matrix separates pass/fail/not run; no secrets/data tracked; precise continuation point | 0.5–1 day | Clinical review and inaccessible environments remain explicit gates |

## Out of scope

No microservices, vector database, EHR integration, larger model, public hosting, force dependency update, or live clinical cloud experiment. Remaining architecture limits are recorded in the review. Clinical stakeholder sign-off and accessibility assessment cannot be replaced by automated software checks.

Engineering execution status: phases 0–6 completed locally with actual verification recorded in final-verification-report.md. Additional confirmed notes transport, appointment uncertainty, microgram-glyph and Vite-private-serving defects were fixed with regressions. Clinical stakeholder review/acceptance, complete browser/accessibility assessment and non-Windows hardware verification remain explicit external gates. Remote CI is checked at publication; no claim is inferred from workflow configuration alone.
