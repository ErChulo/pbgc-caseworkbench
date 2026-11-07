import { describe, expect, it } from "vitest";
import type { AuditEvent, AuditEventType } from "../../src/domain/case/types";
import {
  EMPTY_AUDIT_FILTER,
  auditEventTypeCounts,
  filterAuditEvents,
  isAuditFilterActive,
  matchesAuditFilter,
} from "../../src/domain/audit/filter";

let sequence = 0;

function event(
  eventType: AuditEventType,
  overrides: Partial<AuditEvent> = {},
): AuditEvent {
  sequence += 1;
  return {
    eventId: `event-${sequence}`,
    caseId: "case-1",
    eventType,
    actor: "local-user",
    component: "EvidenceService",
    at: "2026-01-01T00:00:00.000Z",
    refs: { artifactId: "artifact-1" },
    sequence,
    ...overrides,
  };
}

describe("audit filter", () => {
  it("shows every event when no filter is set", () => {
    const events = [
      event("case-created", { component: "CaseService" }),
      event("artifact-imported"),
    ];
    expect(filterAuditEvents(events, EMPTY_AUDIT_FILTER)).toHaveLength(2);
    expect(isAuditFilterActive(EMPTY_AUDIT_FILTER)).toBe(false);
  });

  it("treats a whitespace-only query as unfiltered", () => {
    const filter = { ...EMPTY_AUDIT_FILTER, text: "   " };
    expect(isAuditFilterActive(filter)).toBe(false);
    expect(matchesAuditFilter(event("case-created"), filter)).toBe(true);
  });

  it("matches text against the event type, component, and references", () => {
    const events = [
      event("artifact-retired"),
      event("plan-fact-saved", { component: "CaseService", refs: { fieldId: "cust-plan-nm" } }),
      event("calculation-run", { refs: { runId: "run-abc" } }),
    ];
    expect(filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, text: "RETIRED" })).toEqual([
      events[0],
    ]);
    expect(filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, text: "caseservice" })).toEqual([
      events[1],
    ]);
    expect(filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, text: "run-abc" })).toEqual([
      events[2],
    ]);
  });

  it("matches text against recorded before and after values only", () => {
    const changed = event("plan-fact-saved", {
      before: "2010-12-31",
      after: "2011-06-30",
    });
    const untouched = event("plan-fact-saved", {
      before: "2010-12-31",
      after: "2010-12-31",
    });
    const events = [changed, untouched];
    expect(filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, text: "2011" })).toEqual([changed]);
  });

  it("filters by event type and keeps the stored order", () => {
    const events = [
      event("artifact-imported"),
      event("plan-fact-saved"),
      event("artifact-imported"),
    ];
    const filtered = filterAuditEvents(events, {
      ...EMPTY_AUDIT_FILTER,
      eventType: "artifact-imported",
    });
    expect(filtered.map((entry) => entry.sequence)).toEqual([
      events[0]?.sequence,
      events[2]?.sequence,
    ]);
  });

  it("scopes the trail to one artifact and ignores other artifacts", () => {
    const events = [
      event("artifact-imported", { refs: { artifactId: "artifact-1" } }),
      event("artifact-retired", { refs: { artifactId: "artifact-2" } }),
      event("evidence-linked", { refs: { artifactId: "artifact-1", linkId: "link-1" } }),
    ];
    expect(
      filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, artifactId: "artifact-1" }),
    ).toHaveLength(2);
    expect(
      filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, artifactId: "artifact-2" }),
    ).toEqual([events[1]]);
  });

  it("requires every active part of the filter to match", () => {
    const retired = event("artifact-retired", { refs: { artifactId: "artifact-1" } });
    const imported = event("artifact-imported", { refs: { artifactId: "artifact-1" } });
    const filter = {
      text: "artifact",
      eventType: "artifact-retired" as const,
      artifactId: "artifact-1",
    };
    expect(filterAuditEvents([retired, imported], filter)).toEqual([retired]);
  });

  it("returns an empty result for a stale event type or artifact id rather than the whole trail", () => {
    const events = [event("artifact-imported", { refs: { artifactId: "artifact-1" } })];
    expect(
      filterAuditEvents(events, {
        ...EMPTY_AUDIT_FILTER,
        eventType: "work-product-created",
      }),
    ).toEqual([]);
    expect(
      filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, artifactId: "artifact-missing" }),
    ).toEqual([]);
  });

  it("does not match an artifact's file name, which the event does not record", () => {
    const events = [event("artifact-retired", { refs: { artifactId: "artifact-1" } })];
    expect(
      filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, text: "census.csv" }),
    ).toEqual([]);
  });

  it("counts distinct event types alphabetically", () => {
    const events = [
      event("plan-fact-saved"),
      event("artifact-imported"),
      event("plan-fact-saved"),
      event("case-created"),
    ];
    expect(auditEventTypeCounts(events)).toEqual([
      { eventType: "artifact-imported", count: 1 },
      { eventType: "case-created", count: 1 },
      { eventType: "plan-fact-saved", count: 2 },
    ]);
  });

  it("does not modify the events it filters", () => {
    const events = [event("artifact-retired"), event("artifact-imported")];
    const snapshot = JSON.parse(JSON.stringify(events));
    filterAuditEvents(events, { ...EMPTY_AUDIT_FILTER, text: "retired" });
    expect(events).toEqual(snapshot);
  });
});
