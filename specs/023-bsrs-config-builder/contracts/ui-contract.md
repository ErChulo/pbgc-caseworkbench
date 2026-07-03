# UI Contract: BSRS Config Builder

## Route

- Path: `#/letters-bcv`
- Visible title: `BSRS Config Builder`
- Workflow label: `BSRS / BCV`

## Required Visible Areas

- Header: `BSRS Config Builder`
- Warning: `Generated output must be reviewed before production use.`
- Upload cards:
  - `R5 plan summary JSON`
  - `Population CSV / JSON`
  - `Base BSRS config.txt`
- Mode selector:
  - `Patch Mode`
  - `Full Scaffold Mode`
  - `Test Runner`
- Inventory panel:
  - R5 loaded status
  - population row count
  - detected fields
  - missing recommended fields
  - config row count
  - parse warnings
- Rule library panel:
  - rule ID
  - title
  - family
  - enabled/disabled state
  - status
- Participant selector/search.
- Participant classification display.
- Validation panel.
- Diff/change-log panel.
- Export buttons:
  - `Export patched config.txt`
  - `Export scaffold config.txt`
  - `Export change log`
  - `Export validation report`
  - `Download manifest.json`

## UX Rules

- The current mode must be visually obvious.
- Patch Mode must show before/after line changes before export.
- Full Scaffold Mode must show a non-production warning before export.
- Missing inputs must produce actionable messages, not silent disabled buttons.
- No step may require manually typing a hidden hash route.
