# Full PDF upload timing follow-up

21 October 2026. The user clarified that the approximately 100-second wait occurred on PDF upload, not pasted text. The earlier 26–33 second numbers were native inference timings, not complete PDF upload timings. The earlier OCR suite rendered a PDF page to an image and submitted that image to the source service; that is not an end-to-end multipart scanned-PDF benchmark.

## PDF-path change

Scanned PDFs previously created and terminated a Tesseract worker for each page. A single worker is now reused within one PDF and terminated before returning. Workers are not shared across uploaded documents. Page order, render resolution, recognition timeout and the 20-page cap are retained. Recognition failure on a scanned page now fails the source extraction rather than reporting a successful partial document.

The upload endpoint records source processing, model processing, evidence checks and total time in response extraction metadata and content-free diagnostic logs. Model time includes initialization and context setup as well as the two inference reads. Client wall time additionally includes upload/response overhead. The earlier automatic GPU-layer offloading change applies to the Qwen stage of PDF uploads as well as other input types.

## Actual multipart PDF checks

`npm run build` followed by `npm run test:pdf-upload` starts a separate production server on port 3308 with a synthetic account and isolated database. It generates two-page digital and image-only scanned PDFs, verifies both pages and order, rejects a 21-page PDF, and submits both valid PDFs through `/api/extract-discharge`. It checks patient identity, medication data from the second page, extraction method, timing fields and zero Gemini calls. The scanned fixture is compressed and below the existing 15 MiB upload limit; an initial uncompressed fixture exceeded the limit and correctly received 413, so that attempt is not counted as a successful scanned upload.

| Input | State | Client upload-to-result | PDF/OCR source processing | Model initialization/setup/inference | Evidence |
| --- | --- | --- | --- | --- | --- |
| Two-page digital PDF | Process-cold local model | 55.043 s | 0.072 s | 54.879 s | 0.012 s |
| Two-page scanned PDF | Same process; model already loaded | 43.918 s | 5.638 s | 38.096 s | 0.006 s |

Both returned successful structured results through actual PDF uploads. Separate source-only checks read the same digital PDF in 47 ms and scanned PDF in 5,981 ms, retaining information from both pages. Those source-only checks do not include Qwen.

These observations show that local model processing dominates these particular examples; PDF reading is additional for scanned input. They are two small synthetic cases on a shared workstation, not a controlled before/after study, a cold-machine benchmark, or a guarantee for longer PDFs. The user's exact PDF was not supplied, so its reported 100-second case has not been reproduced. Cold native/model setup, document length, generated output length, OCR page count and concurrent workload remain relevant.

No model prompt, output allowance, evidence check, image resolution or clinical review gate was weakened to reduce processing time. Existing clinical accuracy limitations remain. The full 31-case clinical development evaluation was not rerun for this OCR resource-lifecycle and timing change.
