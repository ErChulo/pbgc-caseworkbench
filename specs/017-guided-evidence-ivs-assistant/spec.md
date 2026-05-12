# Feature Specification: Guided Evidence and IVS Assistant

**Feature Branch**: `017-guided-evidence-ivs-assistant`  
**Created**: 2026-05-12  
**Status**: Implemented  
**Input**: PlanMetadata state, module readiness state, `reference/Plan File Types.pdf`, scraper prompt references, and existing workflow modules.

## User Story

As a case actuary, I need the workbench to tell me what evidence is needed, where to search in IVS, what scraper JSON contract to use, and which downstream deliverables depend on the fact.

## Requirements

- **FR-001**: Add a visible Evidence Guide route.
- **FR-002**: Evidence Guide MUST map module-level facts to IVS/IPS document classes from `reference/Plan File Types.pdf`.
- **FR-003**: Evidence Guide MUST show scraper contract, accepted input, manual fallback, citation rule, and downstream impact.
- **FR-004**: Evidence Guide MUST reflect current readiness state where available.
- **FR-005**: Evidence Guide MUST export `case-evidence-guide.json` with versioned metadata and PlanMetadata hash.
- **FR-006**: Dashboard and Case Guide MUST link to Evidence Guide.

## Success Criteria

- User can open Evidence Guide before or after metadata is ready.
- User can identify IVS document classes for Metadata, R5, DEL, PF, 436, Estimated Analyses, V1, and BSRS/BCV evidence.
- Build, pack, and offline scan pass.
