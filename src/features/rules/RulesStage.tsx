/**
 * Rules & assumptions — the versioned rule registry.
 *
 * Nothing on this screen computes. It exists so a reviewer can see exactly what
 * the workbench is allowed to calculate, what authority each rule carries, and
 * which provisions are deliberately blocked.
 */

import {
  implementedRules,
  unresolvedRules,
  type RuleRecord,
} from "../../domain/rules/registry";
import { EmptyState, Panel, StatusPill } from "../../ui/components";

function RuleCard({ rule }: { rule: RuleRecord }) {
  const blocked = rule.status !== "implemented";
  return (
    <li className={blocked ? "rule-card blocked" : "rule-card"}>
      <div className="rule-head">
        <div>
          <h3 className="rule-title">{rule.title}</h3>
          <p className="rule-id mono">{rule.ruleId}</p>
        </div>
        <StatusPill tone={blocked ? "warning" : "success"}>
          {rule.status === "unresolved" ? "Unresolved" : "Implemented"}
        </StatusPill>
      </div>

      <p className="rule-summary">{rule.summary}</p>

      <dl className="key-value-list compact">
        <div className="key-value">
          <dt>Formula</dt>
          <dd className={rule.formula ? "mono" : "muted-text"}>
            {rule.formula ?? "No formula recorded"}
          </dd>
        </div>
        <div className="key-value">
          <dt>Units</dt>
          <dd>{rule.units ?? "—"}</dd>
        </div>
        <div className="key-value">
          <dt>Authority</dt>
          <dd>
            {rule.authority.citation ?? (
              <span className="muted-text">No citation recorded</span>
            )}
          </dd>
        </div>
        <div className="key-value">
          <dt>Authority note</dt>
          <dd>{rule.authority.note}</dd>
        </div>
        <div className="key-value">
          <dt>Checked</dt>
          <dd>{rule.authority.checkedOn ?? <span className="muted-text">Never</span>}</dd>
        </div>
        <div className="key-value">
          <dt>Implemented by</dt>
          <dd className={rule.implementedBy ? "mono" : "muted-text"}>
            {rule.implementedBy ?? "Nothing — blocked"}
          </dd>
        </div>
      </dl>

      {rule.blockingReason ? (
        <p className="rule-blocker">
          <strong>Blocked:</strong> {rule.blockingReason}
        </p>
      ) : null}
    </li>
  );
}

export function RulesStage() {
  const implemented = implementedRules();
  const unresolved = unresolvedRules();

  return (
    <>
      <Panel
        id="rules-implemented"
        eyebrow="Stage 5 · Rules & assumptions"
        title="Rules available to calculations"
        description="A rule runs only when it is implemented and carries a recorded citation. Both conditions are checked again at run time, not just here."
        aside={<StatusPill tone="success">{implemented.length} available</StatusPill>}
      >
        <ul className="rule-list">
          {implemented.map((rule) => (
            <RuleCard key={rule.ruleId} rule={rule} />
          ))}
        </ul>
      </Panel>

      <Panel
        id="rules-blocked"
        eyebrow="Fail closed"
        title="Provisions that cannot be calculated yet"
        description="These PBGC provisions are referenced by the casework corpus but have no recorded citation, effective-date analysis, or independent review. They are listed so the gap is visible instead of being filled with a plausible number."
        aside={<StatusPill tone="warning">{unresolved.length} blocked</StatusPill>}
      >
        <ul className="rule-list">
          {unresolved.map((rule) => (
            <RuleCard key={rule.ruleId} rule={rule} />
          ))}
        </ul>
      </Panel>

      <Panel
        id="assumptions"
        eyebrow="Assumptions"
        title="Assumption sets"
        description="Mortality tables, interest, timing, and rounding are versioned records. None is registered in this build."
      >
        <EmptyState title="No assumption set registered">
          <p>
            A calculation that depends on an assumption must reference an
            approved, versioned assumption set. Until one is registered and
            approved, any provision that needs it stays blocked.
          </p>
        </EmptyState>
      </Panel>
    </>
  );
}
