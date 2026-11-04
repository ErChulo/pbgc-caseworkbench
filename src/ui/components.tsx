/**
 * Small presentational primitives shared by every stage.
 *
 * Native elements first (design.md §10). Status is never conveyed by colour
 * alone: every pill carries a text label, and icons are decorative.
 */

import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "muted" | "info";

export function StatusPill({
  tone,
  children,
  title,
}: {
  tone: StatusTone;
  children: ReactNode;
  title?: string | undefined;
}) {
  return (
    <span className={`status ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Panel({
  eyebrow,
  title,
  description,
  aside,
  children,
  id,
}: {
  eyebrow: string;
  title: string;
  description?: string | undefined;
  aside?: ReactNode;
  children: ReactNode;
  id?: string | undefined;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} className="panel" aria-labelledby={headingId}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={headingId}>{title}</h2>
          {description ? <p className="panel-description">{description}</p> : null}
        </div>
        {aside ? <div className="panel-aside">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ProvenanceChip({
  workbookSha256,
  sheet,
  row,
  fieldName,
}: {
  workbookSha256: string;
  sheet: string;
  row: number;
  fieldName: string;
}) {
  return (
    <span
      className="provenance-chip"
      title={`Data Dictionary Complete — sheet ${sheet}, row ${row}, field ${fieldName}, workbook ${workbookSha256.slice(0, 12)}…`}
    >
      {workbookSha256.slice(0, 8)} · {sheet} · row {row} · {fieldName}
    </span>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="key-value">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function BlockedNotice({ reason }: { reason: string }) {
  return (
    <div className="blocked-notice" role="note">
      <strong>This stage is not available yet.</strong>
      <p>{reason}</p>
    </div>
  );
}
