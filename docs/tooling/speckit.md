# SpecKit with OpenCode

The bootstrap scripts use the official OpenCode integration key `opencode` and initialize in the current project. They do not install SpecKit globally.

Before initialization:

```bash
uvx --from git+https://github.com/github/spec-kit.git specify check
uvx --from git+https://github.com/github/spec-kit.git specify integration list
uvx --from git+https://github.com/github/spec-kit.git specify integration info opencode
```

The project constitution is authored in `governance/constitution.md`. After initialization, the bootstrap script copies it to `.specify/memory/constitution.md`. Commit both the generated SpecKit scaffolding and the governing source so changes remain reviewable.

Recommended feature sequence:

1. Specify a user outcome, evidence sources, exclusions, and success measures.
2. Clarify policy/date/rounding ambiguity before technical planning.
3. Plan schemas, boundaries, provenance, threat controls, and independent checks.
4. Create tasks that deliver thin vertical slices.
5. Analyze specification/plan/task consistency.
6. Implement, test, reconcile, and record remaining uncertainty.

