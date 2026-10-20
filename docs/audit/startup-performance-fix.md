# Windows startup performance follow-up

20 October 2026. The reported blank command window was the project launcher, not a PowerPoint problem. The old batch file printed nothing until its PowerShell child finished startup. That child started the TypeScript development server, with Vite middleware and first-page compilation.

## Change

- The batch file prints immediately. PowerShell identifies startup stages, reports elapsed readiness time and prints periodic waiting/log guidance.
- The launcher uses the built production frontend and backend. It rebuilds missing outputs or changed source/configuration/package inputs, then reuses that build on normal launches. Added/deleted files invalidate the cache.
- Build freshness uses input paths, sizes and modification times. Timestamp-and-size-preserving replacements require deleting `.runtime/build-inputs.txt` to force a rebuild. This is not a cryptographic source-integrity check.
- The child receives production mode without permanently changing the caller's environment. The separate `npm run dev` workflow remains available.
- Model initialization stays lazy. These changes address application opening, not extraction inference latency. Existing process ownership, authentication, loopback binding and persisted clinical records are retained.

## Recorded verification

An isolated comparison on this workstation measured development HTTP readiness at 6.769 seconds and first HTML/entry completion at 9.038 seconds; production readiness at 3.646 seconds and first HTML/entry completion at 3.741 seconds. These direct-process timings exclude the batch/PowerShell wrapper and are not cold-machine benchmarks or guarantees.

The updated Windows lifecycle suite passed: production HTML despite a development-mode parent, browser dispatch, duplicate reopen without replacement, stale-PID protection, cached-build reuse, source addition/deletion rebuilds, stop and repeated stop. It used a synthetic local account and separate database. Its cached launch reported 6.8 seconds; builds plus startup reported 24.3, 27.0 and 27.6 seconds. Rebuild time is expected after changes, rather than every launch.

TypeScript and the production smoke passed. The latter checked authentication, private-file denial, origin rejection, generation/save, approval, native-form PDF and persistence across restart using synthetic records. Qwen inference, clinical evaluation, cold-boot/antivirus effects and arbitrary browser download completion were not retested for this launcher change. Earlier model timings must not be interpreted as app-opening time.
