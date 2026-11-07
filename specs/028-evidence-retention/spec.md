# 028 — Evidence retention: discard a stored copy

Status: implemented
Depends on: 024 evidence import admission, 025 bundle payload verification, 027 evidence retirement
Decision family: retention; reviewer-controlled and append-only

## Problem

Retirement (027) withdrew a file from active evidence without deleting it, so the
bytes stayed in the browser and in every bundle. The case budget is 1 GiB. A case
at that cap could not accept another file, and no action could reclaim space. The
README named the gap: “Reclaiming space needs a separate retention decision.”

Deleting the artifact record would break the append-only chain: its SHA-256 is the
anchor for links, reviewer citations, participant sources, and audit events, and a
bundle could no longer restore the case faithfully. Deleting only the bytes while
keeping the record preserves that chain but makes the copy unavailable forever, so
the decision must be explicit, reasoned, and visible.

## What this spec adds

- A reviewer-controlled **discard stored copy** action for a retired artifact that
  no evidence link references. It requires a reason and the file’s exact name, and
  appends an `artifact-bytes-purged` audit event.
- Two optional artifact fields, `bytesPurgedAt` and `purgeReason`. The record keeps
  `fileName`, `byteSize`, `sha256`, `importedAt`, `retiredAt`, and
  `retirementReason`; the bytes are removed from local storage.
- Budget accounting that counts stored copies only. A discarded copy no longer
  counts against the 1 GiB case limit.
- Guards that make a purged record unusable as evidence: it cannot be reinstated,
  classified, linked, or individually integrity-checked, and re-importing the same
  content is refused rather than reported as a usable duplicate.
- Bundle support: a purged artifact travels as a record without `bytesBase64`.
  Export, manifest verification, payload verification, and restore all distinguish
  “discarded by decision” from “bytes missing”.
- UI: a discard form on the retired card requiring a reason and the exact file
  name, a `Bytes discarded` status, the purge reason and date, and no
  reinstatement control. The case byte total reflects the reclaimed space.

## Functional requirements

- **FR-001** Only a retired artifact may be purged. An active artifact fails closed
  with an instruction to retire it first.
- **FR-002** Purge requires a non-empty reason of at most 300 characters and an
  exact match of the artifact’s file name; the action appends no event on failure.
- **FR-003** Purge is refused while any evidence link names the artifact, because
  the link would point at bytes that no longer exist.
- **FR-004** Purge is refused when storage returns no copy or a copy whose byte
  length differs from the recorded byte size. Nothing is deleted and no event is
  appended.
- **FR-005** A successful purge removes the bytes and stores `bytesPurgedAt` and
  `purgeReason` in one transaction. It appends `artifact-bytes-purged` with the
  artifact id, the stored byte size and SHA-256 in `before`, and the reason in
  `after`.
- **FR-006** A purged artifact cannot be reinstated, classified, linked, or
  integrity-checked. Each action says the stored copy was discarded rather than
  reporting a generic missing file.
- **FR-007** Re-importing content whose SHA-256 matches a purged record is refused
  with an explanation. The record and hash remain; this build has no reattach path.
- **FR-008** The case byte budget is the sum of `byteSize` over artifacts that are
  not purged. Retired artifacts that still hold bytes continue to count.
- **FR-009** Bundle export omits `bytesBase64` for a purged artifact and refuses to
  attach bytes to one. It also refuses to export an unpurged artifact without
  bytes. Restore stores a purged artifact through the port’s purged-artifact path
  and never writes placeholder bytes.
- **FR-010** Bundle payload verification requires a valid `bytesPurgedAt`, a
  non-empty `purgeReason`, and a retirement date on a purged artifact; refuses a
  purged entry that also carries bytes; refuses a purge reason without a date; and
  refuses an evidence link or locator that names a purged artifact.
- **FR-011** The bundle schema version is unchanged. The two optional fields live
  in the existing artifacts part, so 1.0.0 and 1.1.0 bundles remain readable; a
  bundle without the fields restores exactly as before.
- **FR-012** The audit table shows `artifact-bytes-purged`, and the retired card
  shows the discard date and reason alongside the retained hash.

## Acceptance criteria

- Unit tests cover: a successful purge with its audit event and retained identity;
  the retirement, reason, exact-name, link, missing-copy, and double-purge guards;
  post-purge verification, reinstatement, classification, and linking refusals;
  duplicate re-import refusal; and the stored-bytes total.
- The integration bundle test proves a purged record and a retained record travel
  together, that a restamped manifest cannot smuggle bytes back, that a purge
  without a reason or with a link to the discarded copy is refused, and that
  restore keeps the marker, reason, retirement, and audit reference without bytes.
- The Playwright suite retires a file, discards its stored copy with a reason and
  exact name, sees `Bytes discarded` and a zero stored total, reloads, and finds
  the purge event in the audit table.
- `npm run check` and `npm run test:e2e` pass.

## Non-goals

- No automatic, scheduled, or bulk retention; every discard is one reviewer action
  on one retired artifact.
- No case deletion, no deletion of the artifact record, and no rewriting of the
  SHA-256, byte size, links, citations, participant sources, or audit events.
- No reattach path for a discarded copy in this spec. Recovering the bytes needs
  a separate action that verifies a supplied file against the retained hash before
  re-storing it; spec 029 adds that action, and it leaves the file retired.
- A reviewer-decision citation or participant source does not block purge, because
  neither is an evidence link. Both continue to resolve to the retained record and
  its hash, and the UI states that the bytes are unavailable; a future retention
  policy may widen the refusal set.
- No change to the 1 GiB and 100 MiB limits, no encryption, and no PBGC rule.
