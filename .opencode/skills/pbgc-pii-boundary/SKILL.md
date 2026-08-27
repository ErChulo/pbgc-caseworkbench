---
name: pbgc-pii-boundary
description: Apply local-first privacy and PII controls to imports, OCR, storage, logs, prompts, tests, browser APIs, backups, and exports. Use whenever a feature touches source files, participant data, external tools, persistence, or sharing.
metadata:
  domain: privacy
  default: deny-external
---

# PBGC PII boundary

## Procedure

1. Classify every data element and trace it from import through deletion/export.
2. Keep OCR, parsing, detection, and indexing local. Disable runtime CDN/network dependencies.
3. Use opaque IDs in logs and error reports. Redact technical details before displaying or copying.
4. Keep real case content out of Git, tests, screenshots, telemetry, agent prompts, MCP calls, and browser automation.
5. Protect CSV/XLSX exports from formula injection and archives from path traversal.
6. Make export scope explicit, show included sensitive classes, hash the bundle, and record an audit event.
7. Make backups visible and recoverable; do not claim encryption without a documented key model.
8. Request `@privacy-boundary-reviewer` for any new data flow.

PII detection is a review aid, not proof that an artifact is safe to transmit.
