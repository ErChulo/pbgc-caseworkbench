# Synthetic fixtures only

Every fixture must be explicitly synthetic and use impossible/reserved identifiers where available. Include a fixture manifest stating its purpose, expected outputs, independent-review status, and generation seed.

Never copy a real case and “change the names.”

## Fixture manifest

| Fixture | Purpose | Expected output | Independent review | Generation seed |
|---|---|---|---|---|
| `population-register.golden.html` | Pins the participant register rendering (ages, provenance rows, blocked-rule list) | Byte-identical HTML from `tests/unit/populationRegister.test.ts` | Not yet independently reviewed | None — fixed synthetic dates and ids, no randomness |

The register fixture contains reserved identifiers (`CW-0001`, `P-0001`, `P-0002`) and
impossible-by-design artifact ids. It contains no currency figure: the rules needed to
produce one are unresolved, and the test asserts the absence.

