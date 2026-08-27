---
name: pbgc-ui-design
description: Design and implement the Case Workbench interface using its black/off-white evidence-first system, accessible components, progressive disclosure, and cognitively calm workflows. Use for screens, components, tokens, tables, review queues, evidence drawers, or UX copy.
metadata:
  domain: interface
  target: wcag-2.2-aa
---

# PBGC interface design

Read `docs/design.md` before changing UI code.

## Procedure

1. Name the user decision, primary action, blockers, and source evidence for the screen.
2. Use the stage rail, case bar, primary work surface, and optional evidence drawer; do not add dashboard cards by habit.
3. Use the design tokens. True black is the base; warm off-white is primary text; semantic colors always include text/icon meaning.
4. Build with semantic native elements and full keyboard behavior. Preserve focus across drawers/dialogs and include loading, empty, partial, conflict, error, and success states.
5. Keep provenance one gesture from every material value.
6. Use tabular figures, unambiguous dates, visible units, sentence-case labels, and plain-language error recovery.
7. Test 200% zoom, narrow viewport, keyboard-only operation, reduced motion, contrast, and screen-reader landmarks.

Reject decorative gradients, glass effects, remote fonts, hover-only actions, tiny gray text, red/green-only meaning, and AI summaries that obscure source evidence.
