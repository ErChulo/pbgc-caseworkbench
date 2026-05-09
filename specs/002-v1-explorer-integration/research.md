# Research: V1 Engine Explorer Integration

## Decisions

- Use iframe embedding first because the explorer repository has no `package.json` and already ships a large standalone `index.html`.
- Do not bundle `reference/raw-approved-v1-engines` into the release file. The corpus is about 137 MB across 247 JSON files.
- Treat approved V1 engines as read-only governing reference inputs selected by the user through browser upload controls.
- Caseworkbench owns authoritative V1 warehouse/session state.
- The explorer receives PlanMetadata context and warehouse data from the parent app.
- Ranking against R5 summary JSON is reuse evidence only, not approval.

## Alternatives Considered

- **Copy/paste explorer code into `main.js`**: rejected because it is hard to maintain and obscures ownership.
- **Bundle all approved engines**: rejected because it bloats the single HTML and makes updates painful.
- **Let explorer own warehouse state**: rejected because Caseworkbench must own audit, metadata, and manifest state centrally.

## Open Follow-Up

- Decide whether large V1 warehouse state remains in memory only or uses IndexedDB for browser sessions.
