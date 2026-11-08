# ADR 0001: Local-first browser application

Status: accepted  
Date: 2026-08-27

## Decision

Build a single-user browser application with no required backend. Inline application JavaScript and CSS into one production HTML file. Keep large, downloadable OCR/model/WASM/template assets in a versioned local companion folder.

## Consequences

- Case PII can remain on the workstation.
- IndexedDB/OPFS adapters and deliberate export/backup are required.
- Multi-user collaboration, server authority, and central audit are out of scope.
- A local HTTP server is the original supported runtime. **Superseded by ADR 0003** for `file://`: the workbench now proves storage at boot and runs from a double-clicked file when the browser allows it.
- Build tooling may use npm, while the deployed application must make no network requests.

