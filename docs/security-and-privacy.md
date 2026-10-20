# Security and privacy

## Intended boundary and threat model

This is a single-account workstation application bound to IPv4 loopback. It defends against unauthenticated local HTTP access, foreign browser origins/hosts, malformed requests, client-forged approval/version metadata, and common workflow errors. It is not configured for LAN/public hosting, enterprise identity, multiple tenants, administrator-resistant storage, or certified clinical signatures.

A local administrator, compromised OS/browser extension, filesystem reader with sufficient permissions, or malicious native dependency is outside the application's protection boundary. A passing security test is not an exhaustive penetration assessment.

## Authentication and browser boundary

The UI and API except health require HTTP Basic credentials. Password checks use salted scrypt hashes and timing-safe comparisons. Generated credentials live in ignored `.runtime/credentials.json`; the convenience `.runtime/login.txt` contains the actual login and must be protected. Configured passwords must have at least 16 characters. No secret values should enter reports or screenshots.

Host allowlisting, origin equality and Sec-Fetch-Site checks reject foreign/null/cross-site browser requests. Requests without Origin can be legitimate native clients and are not automatically denied; they still require authentication and local host checks. There is no CORS grant. Native PDF form POSTs use the same protected endpoint. Browser credential caching persists for its session.

No TLS is configured for local HTTP. Changing only the bind address is not a supported network deployment. The rate budget is in-memory, per-address and process-local; synchronous password hashing is a resource limit, not a hardened enterprise identity service.

Development Vite serving explicitly denies runtime/data/model directories, database/backup files and the default environment/key/Git patterns. A synthetic sentinel reproduced authenticated private-file disclosure before this configuration fix. Direct, encoded and `/@fs` requests now return 403 in the development smoke test; production never returns the sentinel. No actual credentials or clinical files were requested. Keep custom DATA_PATH files on a private volume outside the frontend workspace, especially for nonstandard filenames.

## Clinical data flow and retention

Uploaded file buffers, PDF rendering, OCR worker data and source text are processed locally. OCR workers and inference contexts are disposed. Original files are not retained as an immutable source archive. Verified facts, report versions, audits, approval metadata and history are stored in SQLite; extraction provenance is incomplete after verified-object reconstruction. Keep the original source available independently.

The database, WAL files and backups contain clinical content and are not application-encrypted. Protect them with the workstation's account/file controls and disk protection. Unix file modes are set where supported; Windows ACL inheritance is not an equivalent independently verified access-control policy. No automatic retention purge or deletion endpoint is implemented.

Routine backend diagnostics omit clinical text. Model status uses a repository-relative path; model initialization no longer prints an absolute path or raw native initialization error. Cloud connectivity errors are generic. Synthetic evaluation outputs are ignored under `.runtime`; never replace these fixtures with real patient content or commit real clinical artifacts.

## Optional cloud boundary

Cloud processing is disabled by default. A credential alone cannot enable it. An explicit model, credentials, CLOUD_PROCESSING_ENABLED and the operation's flag are needed for audits or rewriting. Initial English generation stays local. The optional connectivity probe sends an operational prompt; audit/rewrite sends verified clinical content/report text to Google. Do not enable these paths for real patient data without an appropriate governed decision.

Cloud output is an untrusted candidate. Rewriting does not save/approve a report automatically. Requested audit errors, invalid output or timeout produce unavailable status and prevent approval. Automated tests use disabled cloud plus intercepted network calls; no live clinical cloud tests are part of CI.

## Approval, recovery and model integrity

The backend reconstructs permitted request fields, owns identities and versions, recomputes saved audits, clears approval on edits, and loads the saved document ID for final PDF generation. Optimistic concurrency is rechecked inside SQLite transactions. Append-only event triggers prevent ordinary SQL updates/deletes through the app, not privileged database replacement/schema changes.

Saved audits also carry an audit-policy version. Legacy or mismatched policies cannot authorize approval/export; save/re-audit and clinician review are required. Bump the policy constant whenever audit/evidence policy changes affect saved approval eligibility. This check does not rewrite historical events or perform a cloud audit during export.

Pinned model revision and SHA-256 checks protect the downloaded weights. Partial downloads use unique temporary files and are removed on failure; existing weights are preserved if validation fails. This is artifact integrity, not proof that the model is clinically accurate or immune to source prompt injection.

Recognized instruction-like evidence, stopped/historical/conflicting medication contexts and conflicting allergy statements are conservatively marked UNCLEAR. These are limited text rules. Unrecognized adversarial language, omissions and wrong typed fields remain possible and require original-source review.

## Incident and recovery procedure

Stop the managed app, preserve the database and any WAL files, keep diagnostic copies private, and avoid deleting data as a repair. Use the consistent backup command and restore into a new file; never overwrite the only copy. If a credential may have leaked, perform account configuration changes locally, restart and close cached browser sessions. Recheck the saved version/audit/approval before distributing a PDF. Record the incident and obtain qualified review when clinical content may have been affected.

Open findings and verification limits are tracked in [the review](audit/architecture-security-review.md) and [final verification](audit/final-verification-report.md). This guide claims neither regulatory compliance nor unsupervised clinical readiness.
