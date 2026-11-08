# ADR 0003: Prove storage at boot instead of refusing `file://`

Status: accepted
Date: 2026-11-08
Supersedes the `file://` sentence in ADR 0001

## Context

The office handover is one downloaded HTML file, opened by double-clicking it. The
machines have no Node, no Python, and no server calls available, so the loopback
server ADR 0001 specified as the supported runtime cannot always be run there.

ADR 0001 said `file://` was "not guaranteed", and the shell turned that into a
refusal: on a file page it rendered, disabled the work, and told the reviewer to
start a server. Probing the built artifact in Chromium on 2026-11-08 showed the
refusal was a policy in this codebase, not a browser limit:

- a `file://` document is a secure context in Chromium;
- IndexedDB and localStorage both worked, and a write survived a reload and was
  visible to a second local document in the same session;
- OPFS was blocked.

Whether a given profile allows it is still a browser decision — private windows,
site-data settings, and enterprise policy can refuse or clear it — and the earlier
probe could not establish durability across a full browser restart.

## Decision

Probe storage at boot and let the answer choose the store set.

- `probeStorage()` writes one marker to a dedicated `storageProbe` store, commits
  it, and reads it back in a later transaction. Only that round trip is called
  persistent. It has a deadline, and it never throws: any failure — missing
  IndexedDB, `SecurityError`, blocked upgrade, timeout — is session mode.
- A persistent boot uses the IndexedDB adapters; a session boot uses the in-memory
  adapters. `loadServices()` builds one service set over the chosen adapters, so
  the two can never be mixed.
- The shell states the answer: a warning banner and an "Open · this tab only" pill
  for session mode; on a persistent file page, a note that local file pages share
  one storage origin and that a bundle is the record to keep.
- The probe retains the previous launch's marker so the next launch can report
  whether storage survived, and says nothing more than that.

## Consequences

- A double-clicked file is now a supported launch path: case, evidence bytes,
  PDF text, reviewer decisions, calculations, and the review bundle all work
  from `file://`, proven by a browser test that opens the artifact from its path.
- A browser that refuses storage no longer looks broken. The workbench still runs
  in full for the session and says plainly that closing the tab discards it.
- Case content on a `file://` origin is readable by any local HTML document from
  that computer. That is a property of the scheme, not of this app; it is stated
  in the interface and in the runbook, and the loopback server remains the
  supported path where that sharing is unacceptable.
- The in-memory adapters are now production code, not test doubles. They are held
  to the same purge and evidence-copy contracts as the IndexedDB adapters.
- The single-file build grows by the pdf.js worker module (≈1.3 MB uncompressed),
  because a `file://` page cannot run the bundled blob worker and needs the
  main-thread handler instead.
- Durability across a browser restart remains the browser's promise, not this
  app's. The bundle export stays the canonical record, and the runbook says so.
