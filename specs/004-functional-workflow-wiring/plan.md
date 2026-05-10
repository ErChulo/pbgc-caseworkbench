# Implementation Plan: Functional Workflow Wiring

## Scope

Wire the single offline SPA around one current case workflow. This does not finish every actuarial generator; it makes the minimum deliverables visible, names their inputs, and packages available shared case context for downstream implementation.

## Technical Approach

- Extend central state with normalized R5 summary state and selected V1 candidate state.
- Add the DEL module route and deliverable card.
- Replace the dashboard cards with the full minimum deliverable set.
- Add reusable readiness/context UI for PlanMetadata, R5, and selected V1.
- Add select buttons to V1 ranking results.
- Embed upstream case context into scaffold artifacts.

## Constraints

- Single HTML release under `file://`.
- No backend, no runtime network, no CDN.
- Approved V1 JSON files remain read-only uploads.
- Unknown data remains `unknown` or `na`.
- Versioning remains at `0.7.0`.

## Validation

- `npm.cmd run build` from `web/`
- `npm.cmd run pack` from `web/`
- scan `release/pbgc-workbench.html` for external/root asset links
