# R1 contribution contract and publication gates

Status: initial typed domain contract, **not** a complete R1 renderer. See [architecture proposal](../architecture/physics-effects-work-products.md).

## Why this exists

R1 is the **final Actuarial Case Memo**. Every earlier work product may contribute factual findings, actuarial calculations, approved interpretations, supporting excerpts, reconciliations, uncertainties, references, and formal decisions to its template.

A finished R5/DEL/PF/§436/AMB/V1/BSRS file alone is not sufficient input: the machine-readable **contribution package** is a parallel required output.

## Core objects

The first implementation is in [`contributions.ts`](../../src/domain/work-products/contributions.ts).

| Object | Meaning |
|---|---|
| `EvidencePointer` | Original artifact ID, optional verified SHA-256, precise source locator, verified Image Viewer document number when cited |
| `FindingDependency` | Versioned source rules, calculations or prior findings used by a conclusion |
| `R1Placement` | Template section identifier and intended role (summary, detail, table, appendix, reference) |
| `PublishedFinding` | Versioned finding with narrative, case, upstream work product, snapshot, sources, targets and approval state |
| `R1AssemblyInput` | Case, candidate findings, reviewed template section IDs, current source snapshots and dependency versions |
| `R1AssemblyResult` | Ordered section plan, blocking issues and a narrowly scoped readiness result |

`planR1Assembly` is deterministic, pure and render-independent. A `ready: true` result means **only that all submitted findings passed the stated gates**. It does not certify that the case, mandatory R1 sections or full template is complete.

## Publication algorithm

1. Collect findings from each upstream work product's current snapshot.
2. Discard only **superseded** findings from the current rendering set; retain them in audit history.
3. Block drafts and review-only findings for final R1 publication.
4. Validate evidence location, source artifact and requested Image Viewer citation number.
5. Require an explicit reviewer and approval date for approved findings.
6. Validate that the originating work product's snapshot is current.
7. Validate all declared rule, interpretation, calculation and prior-work-product dependency versions.
8. Validate target sections against the **reviewed R1 template manifest**.
9. Sort findings deterministically within each section; do not duplicate a finding in a section.
10. Let the separate **completeness**, **reconciliation**, **cross-section consistency**, **template fidelity**, and **human sign-off** gates decide final memo release.

An unapproved legal interpretation, a disputed population count, or an ambiguous calculation must remain an exception, not a plausible-looking memo assertion.

## Image Viewer references

Store the actual document number only when a reviewer has verified it; preserve the original file's independent artifact identifier as well.

Example synthetic pointer:

```json
{
  "sourceArtifactId": "synthetic-amb-memo",
  "sourceSha256": null,
  "sourceLocation": "page 5",
  "imageViewerDocumentNumber": "123",
  "citeAsImageViewer": true
}
```

The resulting reference can be:

```text
Image Viewer Document #123, page 5
```

If the Image Viewer number is missing, the R1 assembler must block **that Image Viewer citation** rather than fabricate it.

The application must avoid repeating PII in unneeded text fields and must never send source artifacts or actual case content to external services.

## Section routing examples

The R1 sample and instructions call for:

- **Section 2:** PDR and valuation participant count reconciliation.
- **Section 3:** data issues, corrections, PA_AMB acceptance decision, supporting AMB memo citations.
- **Section 4:** plan documents, effective/adoption dates and changes.
- **Section 5:** plan formula summary.
- **Section 11:** nonroutine interpretations, approved determinations and documented decisions.
- **Sections 13–18:** applicable guarantee/limitation/allocation findings.
- **Sections 19–23:** benefit changes, estimated adjustments, post-NRD issues.
- **Section 25:** BSRS issues and statement production.
- **Section 26:** other material findings.

These are **hints**. The actual manifest is extracted and reviewed from the authoritative template; no product hard-codes every case's memo text.

## Example workflow: PA_AMB

```text
PA_AMB source + tested reconstruction
  -> calculation trace and discrepancy
  -> reviewed hypothesis and acceptance proposal
  -> authorized actuarial decision (approved)
  -> publish findings with source doc numbers
  -> R1 Section 3 (acceptance) and Section 11 (interpretation, if applicable)
  -> final R1 after all other required contributions and checks
```

Never infer the prior administrator's methodology solely from a numerical match.

## Tests and release status

Initial tests: [`workProductContributions.test.ts`](../../tests/unit/workProductContributions.test.ts). They exercise approval gating, stale dependencies, duplicate findings, template section mapping and Image Viewer numbers.

The current implementation does **not** yet provide:

- persistent append-only ledger storage and bundle migration;
- propagation of staleness through the complete DAG;
- automatic extraction and publication from all upstream modules;
- a reviewed R1 template manifest and byte-preserving renderer;
- required-section completeness or actuarial cross-product reconciliation;
- final memo sign-off and export.

These are explicit blocked implementation items, not completed features.

## Official reference material

The casework source collection includes `R1 Simplified Instructions.docx`, `Actuarial Case Memo Shell_08062026.doc`, and `Actuarial Case Memo Sample Language_06042026.docx`. The sample language explicitly references accepted prior administrator AMBs in **Section 3** and uses Image Viewer document-number citations. A production implementation must verify the governing template version and preserve its native format.
