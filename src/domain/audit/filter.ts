/**
 * Audit-trail filtering.
 *
 * The audit trail is append-only evidence, so filtering is a view and never a
 * query over what the case holds: the same events stay in the case, in the
 * bundle, and in their per-case sequence. This module decides only which of
 * those events a reviewer has asked to see.
 *
 * Matching is deliberately literal. A text query is a case-insensitive
 * substring of the event's own recorded fields — type, component, actor,
 * reference ids, and before/after values — and nothing else. It never matches
 * on the artifact's file name, which the event does not record; a reviewer
 * scoping the trail to one file uses the artifact filter, and the UI resolves
 * that id to a name.
 */

import type { AuditEvent, AuditEventType } from "../case/types";

/** `all` is the unfiltered default; it is not an audit event type. */
export type AuditEventTypeFilter = AuditEventType | "all";

export type AuditFilter = {
  /** Free text, trimmed and matched case-insensitively; empty matches all. */
  text: string;
  eventType: AuditEventTypeFilter;
  /** When set, only events naming this artifact in `refs.artifactId`. */
  artifactId: string | null;
};

export const EMPTY_AUDIT_FILTER: AuditFilter = {
  text: "",
  eventType: "all",
  artifactId: null,
};

/** True when the filter would show fewer events than the case contains. */
export function isAuditFilterActive(filter: AuditFilter): boolean {
  return (
    filter.text.trim() !== "" ||
    filter.eventType !== "all" ||
    filter.artifactId !== null
  );
}

function haystack(event: AuditEvent): string {
  const parts: string[] = [event.eventType, event.component, event.actor];
  for (const value of Object.values(event.refs)) {
    if (value !== undefined && value !== "") parts.push(value);
  }
  for (const value of [
    event.before,
    event.after,
    event.rawBefore,
    event.rawAfter,
  ]) {
    if (value !== undefined && value !== "") parts.push(String(value));
  }
  return parts.join("\n").toLowerCase();
}

/**
 * True when the event matches every active part of the filter. Unknown event
 * types and artifact ids simply match nothing rather than being ignored, so a
 * stale filter shows an honest empty result instead of the whole trail.
 */
export function matchesAuditFilter(event: AuditEvent, filter: AuditFilter): boolean {
  if (filter.eventType !== "all" && event.eventType !== filter.eventType) {
    return false;
  }
  if (filter.artifactId !== null && event.refs.artifactId !== filter.artifactId) {
    return false;
  }
  const needle = filter.text.trim().toLowerCase();
  if (needle === "") return true;
  return haystack(event).includes(needle);
}

/**
 * Filter the trail, preserving the order given (the stored sequence). A
 * filtered result is a subset, never a reordering or a renumbering.
 */
export function filterAuditEvents(
  events: readonly AuditEvent[],
  filter: AuditFilter,
): AuditEvent[] {
  return events.filter((event) => matchesAuditFilter(event, filter));
}

export type AuditEventTypeCount = {
  eventType: AuditEventType;
  count: number;
};

/** Distinct event types present in the case, alphabetical, with their counts. */
export function auditEventTypeCounts(
  events: readonly AuditEvent[],
): AuditEventTypeCount[] {
  const counts = new Map<AuditEventType, number>();
  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([eventType, count]) => ({ eventType, count }));
}
