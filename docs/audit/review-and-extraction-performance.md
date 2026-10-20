# Review controls and local inference performance

21 October 2026. This follow-up addresses the request to replace separate per-field review buttons with clickable statuses, provide a bulk review action and investigate approximately 100-second extraction waits.

## Review controls

Clicking UNCLEAR marks that unchanged value FOUND after source comparison. Clicking FOUND returns it to UNCLEAR. Missing values must be supplied through the editor and cannot be turned into present facts by clicking a badge. The separate per-field Mark reviewed buttons have been removed.

The bottom Mark all reviewed action marks current nonempty values FOUND and leaves empty fields MISSING, including medication and appointment subfields. Its adjacent text requires source comparison. It does not generate, save or approve a report. The update uses the existing dirty-state path, so old source confirmation cannot be used to reach a stale approval. Values are preserved; unsupported or misplaced entries must still be corrected or removed by the reviewer. Bulk review is not a clinical correctness check.

## Performance finding and change

The code previously fixed GPU offloading at 28 layers. This pinned GGUF has 29 offloadable layers including the output layer, which was left on the CPU. Offloading now uses the native runtime's automatic memory-aware selection; the tested workstation selected all 29 layers on Vulkan. CPU fallback remains available. No weights, extraction prompts, context limits, reconciliation, evidence checks or deadlines were reduced to obtain speed.

A same-workstation native comparison generated 128 tokens with the same counting prompt and 8,192-token context. Fixed 28 layers took 3,105 ms; automatic 29 layers took 1,894 ms. This is a small sequential calibration probe, not an independent clinical benchmark or guaranteed speedup. CUDA prebuilt initialization was unavailable on this system despite the installed NVIDIA GPU; no driver or CUDA installation was changed. The supported working backend was Vulkan.

The native model/OCR suite passed 9/9 tests. Its scanned-source extraction measured 26,220 ms inference (3,163 ms proposal; 22,523 ms structured; 1,693 generated tokens). Its three-medication case measured 32,903 ms inference (3,153 ms proposal; 29,388 ms structured; 2,249 generated tokens). Cold model initialization reported 13,540 ms after checksum verification, excluding OCR and other setup. These results do not reproduce the user's exact document or establish that every request finishes within 33 seconds. Long structured outputs can still dominate latency.

Logs and returned benchmark metrics now include actual generated-token count, offloaded layers and per-pass timing. Existing totalTokens/tokensPerSec metrics retain their historical character approximation; use generatedTokens for actual generation counts. Logs do not include raw source text or generated clinical prose.

## Verification and limits

- TypeScript and build passed.
- Fast regressions: 39/39 passed, including clickable-status reversal, no automatic promotion on render, bulk value preservation, empty fields remaining missing, no mutation of input and appointment uncertainty restoration.
- Existing PDF checks: 18 passed; approved-PDF architecture regression passed.
- Native model/OCR: 9/9 passed with zero measured Gemini calls and source-supported independent medication schedules.
- Production smoke passed: authentication, origin/private-file protection, generation/save, approval, native form PDF and restart persistence, using an isolated synthetic database.
- Interactive browser inspection was attempted on that synthetic server, but its browser control surface stalled during sign-in. Component interaction/render checks passed; a full manual browser walkthrough remains outstanding.

The frozen 31-case clinical-development evaluation was not rerun for this hardware/UI change; previous published metrics remain historical evidence for their recorded snapshot. This change does not establish clinical safety, comprehensive extraction accuracy, a latency service level or suitability for unsupervised patient use. Cold loading, OCR, source length, generated output length and machine load remain relevant.
