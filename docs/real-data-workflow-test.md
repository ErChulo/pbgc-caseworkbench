# Real-data workflow test — office runbook

Status: draft for the first controlled pilot.
Scope: **one plan, one reviewer, one workstation, one browser profile.**
This test proves that real plan material can move through the workbench without
inventing a number. It does **not** produce a benefit determination.

## 1. What this test proves, and what it does not

It proves that a reviewer can:

- import real plan documents and a real census, with a hash and a source row for each;
- read the text layer, cite a passage, and link it to a reviewed field;
- record the 71 plan-provision answers with sources;
- import a census, record a control total, and compare a revised census;
- generate the review copy and the Word plan summary from the case's own records;
- export a bundle and restore it as a new case with evidence, decisions,
  population, calculation runs, and audit history intact.

It does **not** prove, and must not be read as proving:

- any benefit, guarantee, priority-category, or §4022(c) amount;
- that the plan summary is the R5 notice (seven R5 cells remain blocked);
- that the census is complete, authoritative, or accepted by PBGC;
- that a scanned document was read (there is no OCR);
- that the workstation's storage is encrypted or access-controlled by the app.

Every benefit amount must remain visibly blocked. If a number appears where the
workbench says it cannot compute one, stop and report it.

## 2. Preconditions

- Node.js **22 or newer** on the office machine. The repository's default shell
  may have an older Node; check `node -v` before starting. Node 18 fails the
  browser-crypto tests and is not supported.
- Current Chromium or Edge, with IndexedDB enabled.
- A **dedicated browser profile** for this pilot. Do not use a shared or synced
  profile. Do not install extensions in it.
- Full-disk encryption and the office's normal screen-lock policy. The app does
  not encrypt IndexedDB or the exported bundle.
- The real plan set in an encrypted folder **outside this repository**. Never
  copy real documents, exports, browser data, or OCR text into the repository.
- A pseudonymous case alias. The plan name and DOPT inside the case are real
  data; the alias must not be the plan's name or a claim number.

## 3. Preflight the documents

Check each file before the session. Record every refusal as a finding; do not
work around it by converting the file externally unless the office approves the
conversion and the converted copy is imported as a new, separate artifact.

| File type | Accepted? | What the workbench reads |
|---|---|---|
| PDF with a text layer | Yes | Text per page, with a page locator |
| Scanned PDF | **No** | Refused: no text layer. No OCR is implemented. |
| DOCX | Yes | Paragraphs; field codes are ignored |
| XLSX | Yes | Cached cell values; formulas are not recalculated |
| `.doc`, `.xls`, `.xlsm`, `.docm` | **No** | Legacy or macro-enabled formats are refused |
| ZIP or archive | **No** | Not an evidence format; extract outside the app if policy allows |

Limits, per file and per case:

- one file: **100 MiB**; one case: **1 GiB** of stored bytes;
- text extraction: 400,000 characters per file, 4,000 units, and 20,000
  characters per unit. An over-limit file is refused whole, never truncated.

Open each PDF and try to select text. If nothing selects, the app will refuse it.
Record the page count and the refusal; do not OCR it for this pilot.

## 4. Data-handling rules for the session

- Serve the app at `http://127.0.0.1:4173`. **Do not open `dist/index.html` by
  double-clicking it**; Chromium denies IndexedDB to `file://` documents.
- Keep the browser offline or verify in DevTools that the app makes no request
  outside its own origin. It is designed to make none.
- Do not take screenshots of the app while real data is on screen. A findings
  note uses the case alias, step number, field name, row number, and hash
  prefix — never a participant name, SSN, address, claim number, date of birth,
  or quoted document text.
- The exported bundle is readable JSON and may contain participant-level data
  and raw evidence. Keep it on the encrypted workstation only. Never email it,
  put it on a shared drive, attach it to a ticket, or commit it.
- The census workbook and any interchange CSV are participant-level data. Keep
  them, and any local mapping worksheet, in the encrypted folder, not in the
  repository. Mapping columns inside the app records the decision and keeps the
  workbook as the evidence; it does not copy cell values into the audit trail.

## 5. Setup on the office machine

Copy only these two paths, keeping the layout:

```text
workbench/
  dist/index.html
  scripts/serve.mjs
```

Then:

```bash
cd workbench
node scripts/serve.mjs
```

Open `http://127.0.0.1:4173` in the dedicated profile. Record the artifact's
identity: the SHA-256 of `dist/index.html`, or the build date shown in the
guided-test notes. Every finding should name that build.

Run the in-app **15-minute test** once, with no real data, to confirm the
machine and browser are healthy. Then start the real case.

## 6. The pilot script

### Step 1 — Create the case

Use **Create new case**. The app assigns a pseudonymous alias such as `CW-0001`;
it cannot be renamed to the plan's name. Do not create a demo case for the
real-data run.

Expected: the case opens at the Case home, and the rail shows the stages.
Record the assigned alias and the artifact hash.

### Step 2 — Import the plan documents

On **Documents**, choose the correct intake class for each file before dropping
it. The classes are:

- **Image Viewer plan documents:** census at termination; plan document set;
  actuarial valuation reports; certified AFTAPS; Form 5500; paid lump sums;
  loans; check register; 204(h) notifications; benefit determinations; benefit
  selections; QDROs; disabled participants.
- **PBGC plan record:** CMS screens; TWG narrative; PIP; trusteeship agreement.
- **Participant data:** salary data (intake only; no salary or accrued-benefit
  calculation is implemented).

For each file:

1. import it and confirm its class, byte size, and SHA-256;
2. use **Read text** on a plan document and confirm page locators appear;
3. if a plan document is a scan, confirm **Read text** refuses it with no text
   layer, then use **Transcribe a passage**: open the stored copy, enter the page,
   and type the passage you need. Confirm it is labelled **Reviewer
   transcription**, that the passage keeps its page, and that the audit event
   names the page and character count but not the text;
4. use **Verify integrity** after the import batch;
5. import a duplicate of one file and confirm it is refused by hash;
6. record an applicability decision, with its basis, for each class the case
   actually holds. A stored file is not a decision, and a class named by a
   work-product policy needs both;
7. record every refusal with its exact message.

Expected refusals: a scanned PDF's text layer (transcribe the passage instead),
legacy/macro Office files, empty files, files over 100 MiB, and a case over
1 GiB. A duplicate is refused rather than stored twice.

### Step 3 — Plan details and citations

On **Plan & people → Plan details**, enter the four dictionary-mapped fields:

- case alias;
- case number;
- plan name;
- date of plan termination (DOPT).

Each field validates on its own and carries its dictionary row and workbook
hash. A value without a source is reviewer-entered and must be labelled as such.

Link the plan document to a field, then cite a passage for a field that already
has a reviewed value. Expected: the citation records the observation, locator,
and excerpt hash; the value is re-recorded with the link; the earlier fact is
not overwritten. A transcribed passage is cited the same way; the app labels it
as your typing, so the citation's strength rests on your check of the page.

If the plan-data repository snapshot is available, import it and confirm the
three authorized R5 header candidates individually. If it is not available,
skip it and record that; the 71 reviewer decisions are unchanged.

### Step 4 — The 71 plan-provision answers

Open the **Plan provisions** view in step 4. Answer at least **10 questions**
across different sections, including:

- one header-rate or benefit-formula question;
- one eligibility or service question;
- one question whose answer is a citation to a file and page or section.

Every answer needs a source. The app records an append-only reviewer decision.
Confirm the answer appears in the Word plan summary immediately. Leave the
remaining questions unanswered; the document must say **"Not recorded"** for
each one.

Spot-check three citations against the imported file. The app stores a pointer,
not a verified quotation; the reviewer is the verification.

### Step 5 — Population and census control

On **Plan & people → People**:

1. If the census is an `.xlsx` workbook, import it directly: choose the
   worksheet, the header row, and the column for each field. Suggestions come
   only from exact header-text matches; confirm each one against the workbook,
   and leave a field unmapped rather than guess. The workbook is stored as
   evidence unchanged, and every record keeps its worksheet and row number.
2. If the census is not `.xlsx`, download the **empty template** and map it in a
   local spreadsheet to the accepted headers: `participant_key`, `record_type`,
   `status`, `date_of_birth`, `date_of_hire`, `date_of_termination`,
   `date_of_death`.
3. Use pseudonymous keys; the key must be 1–40 characters of letters, digits,
   dot, underscore, or hyphen, and must be a text cell. Allowed `record_type`
   values are `participant`, `beneficiary`, and `alternate-payee`. Allowed
   `status` values are `retired`, `separated-vested`, `active-vested`,
   `nonvested`, and `not-in-population`. Numeric status codes are not
   transcribed and are refused.
4. Date columns must hold date-formatted cells or ISO 8601 text. A bare number
   in a date column, a serial before 1900-03-01, and a date with a time of day
   are refused with nothing imported. Format the column as a date, or store the
   date as `YYYY-MM-DD` text, and re-import.
5. If the original census is readable as a PDF or workbook, also import it under
   **Census at termination** so the plan's own file is held. The mapped workbook
   or CSV is stored as evidence automatically; its hash is the participant
   source.
6. Confirm the import is all-or-nothing: one bad row rejects the whole file.
   Correct the workbook or mapping and re-import; the new import becomes
   authoritative.
7. Confirm each record shows its artifact hash and row number, and that age at
   the DOPT is computed. Every benefit amount must still say blocked.
8. Record a **control total** from the plan's own census count, with its source
   and basis. The count is a reviewer control, not a completeness finding.
9. Import a revised census with one changed record. Confirm the newest import is
   authoritative, the earlier rows stay listed as superseded, and the revision
   comparison shows the added, removed, or changed record.
10. If the revision changes the row count, confirm the warning that the current
    control total predates the import, and record a new control total.

The BCV column layout is not transcribed. If the real census cannot be mapped
to the workbench headers without changing meaning, stop and record that as a
blocking finding; do not invent a mapping.

### Step 6 — Review the case

On **Review details**:

- **Rules & assumptions** — read the rule registry. Confirm the implemented
  rules, the blocked provisions, and their reasons. Do not treat a blocked rule
  as available because its citation exists.
- **Calculations** — run an age calculation, and an EPRD only if the DOPT is on
  or after 2002-06-01. Run the aggregate limit only if a maximum guaranteeable
  benefit with a recorded basis is already available; otherwise record the
  requirement, do not guess the amount. A single-plan payee is refused.
- **Reconciliation** — confirm required fields, evidence links, stored-byte
  integrity, facts with provenance, blocked provisions, and the census control
  total. A failed hash check is blocking; an unverified file is attention until
  it is re-hashed.
- **Work products** — generate the review copy only if it is not blocked. If a
  class policy is recorded, confirm every required class has both an
  applicability decision and its stored file; presence alone does not satisfy
  the policy. Do not record a policy merely to make it ready; a policy is a
  reviewer decision with a basis.
- **Review & export** — filter the audit trail to one event type, one evidence
  file, and one text query. Confirm the count says `Showing X of N events` and
  that clearing the filter restores all events.

### Step 7 — Generate the outputs

1. **Work products → Generate review copy → Download HTML.** Open it and check
   every field, its status, its dictionary row, and its evidence count.
2. **Final document → Download plan summary (Word).** Open the `.docx`. Check
   that the recorded answers appear, that unanswered cells say **"Not recorded"**,
   and that the header values are the ones recorded in the case. The R5 notice
   remains blocked; this is a draft, not the notice.
3. Note the downloaded file names and their hashes.

### Step 8 — Export and restore the bundle

1. **Review & export → Export review bundle.** The app re-checks every citation
   and refuses a dangling one before writing the bundle.
2. Confirm the bundle's file name and size. If the workstation has a SHA-256
   utility, record the file hash too; the app does not display a hash for the
   bundle file itself.
3. **Restore from bundle** and select the file.
4. Confirm a **new case** is created with a different alias. Confirm the
   restored case carries the evidence bytes, citations, reviewer decisions,
   population, calculation runs, and audit events, with fact and run references
   remapped.
5. Confirm the original case is unchanged.
6. Tamper with a copy of the bundle outside the app and confirm the restore is
   refused before creating a case. Do not tamper with the only copy; work on a
   duplicate.

### Step 9 — Closeout

Choose one retention path and record it in the findings log:

**Retain** — keep the dedicated profile and the final bundle on the encrypted
workstation, with a review date and an owner. Do not sync the profile or the
bundle.

**Purge** — on Case home, choose **Purge data** for the case. Type the case
alias exactly and give a reason. The action deletes the evidence files and
their stored bytes, extracted text, participant records, plan facts, reviewer
decisions, and calculation runs. The case record and its audit trail stay, and
the case reopens in a review-only state. The retained trail still names imported
file names and records the plan values, calculation results, and decision values
saved during the case, so the purge is not a full removal of case-derived
text. Record the purge date and counts in the findings log. Then delete every
exported bundle copy separately.

If the audit trail itself must be removed, clear site data for
`http://127.0.0.1:4173` in the dedicated profile. That removes every case and
all audit history, so the bundle is then the only record. The purge is not a
secure erase: IndexedDB and the operating system may retain deleted pages
until they are overwritten. Rely on full-disk encryption and the office's
device-retirement procedure.

## 7. Expected refusals and blocked states

Record each one as an observation, not a defect, unless the message is wrong:

- a scanned PDF: no text layer; transcribe the passage you need instead, and
  confirm the record is labelled a reviewer transcription rather than OCR;
- a legacy or macro-enabled Office file: unsupported format;
- an empty file, a file over 100 MiB, or a case over 1 GiB;
- a duplicate file by SHA-256;
- a census with an unknown column, a missing required column, a duplicate key,
  an invalid date, or a hire date before birth: the whole file is rejected;
- an Excel census with an unmapped required field, two fields on one column, a
  numeric participant key or status cell, a bare number in a date column, or a
  sheet too large to read: refused before any record is written;
- the R5 notice: blocked by seven cells that need unauthorized calculations;
- any benefit, guarantee, or priority-category amount: blocked;
- a single-plan payee under the aggregate limit: refused as not applicable;
- a pre-2002-06-01 DOPT under the EPRD: refused, not valued.

## 8. Findings log

Use this template. Do not include case content.

| Field | Value |
|---|---|
| Finding ID | F-001 |
| Step | 5 |
| Case alias | `PILOT-01` |
| Build | SHA-256 prefix of `dist/index.html` |
| Expected | The revised census is authoritative and the earlier rows are superseded. |
| Actual | The earlier rows still counted in the reconciliation total. |
| Severity | Blocking / major / minor / observation |
| Reproducible | Yes / no |
| PII in this entry | None |

Severity guide:

- **Blocking** — data loss, a wrong number where a number is blocked, a network
  request, cross-case leakage, a restore mismatch, or an inability to complete
  the workflow.
- **Major** — a required step is impossible without a workaround, or a document
  is silently misread.
- **Minor** — a label, ordering, or message problem that does not change a value.
- **Observation** — a limitation already documented, confirmed on real material.

## 9. Stop conditions

Stop the session, preserve the browser state, and report immediately if:

- a benefit, guarantee, or priority-category figure appears;
- any request leaves the app's origin;
- data from another case appears;
- a bundle restore accepts a changed hash, a missing part, or a dangling
  reference;
- a stored file's hash no longer matches and the app does not block it;
- the browser crashes and the case cannot be reopened;
- a real participant identifier appears in a downloaded test-notes file.

## 10. Exit criteria

The pilot is complete when:

- every planned document is imported or its refusal is recorded with the exact
  message;
- at least one plan document's text layer is read and a passage is cited to a
  reviewed field, or a passage transcribed from a scan is cited the same way;
- the four plan fields are validated with provenance;
- at least 10 of the 71 provisions are answered with sources, and the Word
  summary shows them while unanswered cells say "Not recorded";
- the census is imported, aged, controlled, revised, and compared;
- reconciliation shows the expected states;
- the review copy and Word summary download and open;
- a bundle exports and restores as a new case with evidence, decisions,
  population, runs, and audit intact;
- no network request, cross-case leak, or unexplained number occurred;
- the findings log is complete and contains no PII.

## 11. Timebox

For one reviewer and one developer, with a plan set that has a text layer:

| Day | Work |
|---|---|
| 1 | Setup, preflight, document import, integrity checks |
| 2–3 | Plan fields, citations, 10–20 provision answers |
| 4 | Census mapping, import, control total, revision comparison |
| 5 | Reconciliation, outputs, bundle restore, closeout |
| 6–10 | Fix blocking and major findings; re-run the affected steps |

Add **2–4 days** if the plan set is scanned and passages must be transcribed by
hand: every cited passage is typed, so the time is bounded by how many citations
the reviewer needs, not by the size of the document. Add **2–4 weeks** only if
the office requires machine OCR, which is not implemented and would have to be
added and validated before those documents enter the flow.

## 12. Known gaps this pilot will confirm

These are expected. Record them; do not fix them in the pilot unless they block
the workflow:

- no OCR for scanned PDFs; a reviewer may transcribe a passage by hand, and that
  record is labelled as the reviewer's typing and is not OCR;
- no legacy or macro-enabled Office formats;
- the case purge removes content but retains the case record and audit trail;
  full audit erasure and secure overwrite are not implemented;
- no encryption at rest; rely on full-disk encryption and the profile;
- no BCV column layout transcription; the reviewer maps each column, and the CSV
  header set is the workbench's interchange format;
- no full R5 notice; seven cells remain blocked;
- no benefit model, guarantee table, §4044 tiers, §4022(c), or assumption sets;
- one plan per case and one browser profile; no multi-user or server share;
- no in-app document viewer; the workstation's own application opens the file;
- the bundle is readable JSON and contains participant-level data.
