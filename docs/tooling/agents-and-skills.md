# OpenCode agents and skills

## Agents

| Agent | Mode | Use |
|---|---|---|
| `case-actuary-builder` | primary | implement a specification and coordinate gates |
| `evidence-auditor` | read-only subagent | inspect provenance and evidence sufficiency |
| `actuarial-formula-auditor` | read-only subagent | independently inspect formulas, units, dates, rounding, and tests |
| `data-dictionary-steward` | read-only subagent | inspect field catalog and mapping impact |
| `privacy-boundary-reviewer` | read-only subagent | threat-model PII and local-only boundaries |
| `workbook-reviewer` | read-only subagent | inspect Excel/OOXML mappings and preservation |
| `quality-gate-reviewer` | read-only subagent | perform final spec, accessibility, regression, and release review |

OpenCode loads project agents from `.opencode/agents/*.md`. Switch to the primary agent or invoke a reviewer with an `@` mention.

## Skills

The ten skills under `.opencode/skills/` encode repeatable workflows for evidence intake, the field catalog, plan rules, actuarial calculations, R5, workbooks, privacy, validation, legacy-module salvage, and UI design. They are intentionally concise: detailed authority and feature-specific requirements belong in versioned sources and specs, not evergreen skill prose.

Each skill directory name matches its frontmatter `name`, uses lower-kebab-case, and includes a specific description so OpenCode can select it when appropriate.

## Models

No model is pinned in this project. The agents inherit the user's configured provider/model, which avoids committing a vendor choice or credential arrangement. For consequential review, prefer a capable reasoning model and require human approval regardless of model.

