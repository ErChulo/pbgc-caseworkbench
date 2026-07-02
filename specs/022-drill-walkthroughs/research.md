# Research: Synthetic Drill Walkthroughs

## Decision: Keep The Drill Separate From Production Runtime

**Rationale**: The user asked for a dedicated drill directory and an assessment of what the project currently proves. A separate drill pack avoids adding new app behavior before the current module gaps are understood.

**Alternatives considered**:

- Add an in-app "demo mode": rejected because it would change runtime code and risk masking incomplete modules.
- Store sample data in `reference/`: rejected because these files are operator drills, not source-of-truth PBGC references.

## Decision: Use Synthetic Placeholder Data Only

**Rationale**: The constitution and AGENTS instructions prohibit PII and invented plan provisions. Synthetic values let the user experience mechanics without implying actuarial correctness.

**Alternatives considered**:

- Use real-looking plan provisions: rejected because it could blur the line between demo data and verified provisions.
- Leave fields blank: rejected because the app needs filled metadata to demonstrate downstream module unlocking.

## Decision: Cover Scaffold Modules As Mechanics-Only Steps

**Rationale**: CodeGraph shows several routes use `renderArtifactModule` and produce draft JSON artifacts with manifests. The drill should demonstrate upload/hash/download mechanics while clearly labeling these outputs as placeholders.

**Alternatives considered**:

- Skip scaffold modules: rejected because the user asked for coverage from metadata ingestion to final products.
- Claim final products are complete: rejected because it would be inaccurate and contrary to the assessment goal.

## Decision: Verify With Existing Pack Command

**Rationale**: The constitution requires `release/pbgc-workbench.html`, and `web/package.json` defines `npm run pack`. Verification should use the current build path without introducing new tooling.

**Alternatives considered**:

- Add a new test runner: rejected because the feature is fixture/documentation focused.
- Use a dev server as the drill path: rejected because the delivered runtime must work under `file://`.
