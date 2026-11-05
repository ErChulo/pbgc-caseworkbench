/**
 * Reviewer-controlled required-class policy for implemented work products.
 *
 * No policy is implied. A reviewer can record a policy that supersedes the
 * previous one, including an explicit "no class required" policy. The form
 * shows the current applicability and file state of every class so the reviewer
 * can see what the gate will evaluate.
 */

import { useState } from "react";
import type { ReviewerDecision } from "../../domain/case/types";
import type { DocumentClassReview } from "../../domain/evidence/documentClassApplicability";
import {
  DOCUMENT_CLASS_GROUPS,
  documentClassLabel,
} from "../../domain/evidence/documentClasses";
import type { DocumentClass } from "../../domain/evidence/types";
import {
  REQUIRED_CLASS_POLICY_SPEC_ID,
  requiredClassPolicyDecisionKey,
  requiredClassPolicyStates,
  serializeRequiredClassPolicy,
  type RequiredClassPolicyState,
} from "../../domain/work-products/requiredClassPolicy";
import { implementedWorkProducts } from "../../domain/work-products/registry";
import type { WorkProductSpec } from "../../domain/work-products/spec";
import { Panel, StatusPill } from "../../ui/components";

type RecordDecision = (input: {
  decisionKey: string;
  specId: string;
  value: string;
  rationale: string;
}) => Promise<void>;

type Props = {
  decisions: readonly ReviewerDecision[];
  classes: readonly DocumentClassReview[];
  onRecordDecision: RecordDecision;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function policySummary(policy: RequiredClassPolicyState): string {
  if (policy.status === "not-configured") {
    return "No policy recorded; class gate inactive";
  }
  if (policy.status === "unrecognized") {
    return "Recorded policy needs correction";
  }
  if (policy.classes.length === 0) {
    return "Recorded: no class required";
  }
  return `Requires ${policy.classes
    .map((id) => documentClassLabel(id))
    .join(", ")}`;
}

function policyTone(policy: RequiredClassPolicyState): string {
  if (policy.status === "not-configured") return "inactive";
  if (policy.status === "unrecognized") return "unrecognized";
  return policy.classes.length === 0 ? "none" : "configured";
}

function classHint(entry: DocumentClassReview): string {
  const applicability =
    entry.applicability.status === "recorded"
      ? entry.applicability.value === "applies"
        ? "Applies"
        : "Does not apply"
      : entry.applicability.status === "unrecognized"
        ? "Decision needs correction"
        : "Applicability not reviewed";
  const files =
    entry.count === 0
      ? "no file"
      : `${entry.count} ${entry.count === 1 ? "file" : "files"}`;
  return `${applicability} · ${files}`;
}

function PolicyCard({
  spec,
  policy,
  classes,
  onRecord,
}: {
  spec: WorkProductSpec;
  policy: RequiredClassPolicyState;
  classes: readonly DocumentClassReview[];
  onRecord: RecordDecision;
}) {
  const currentDecision =
    policy.status === "not-configured" ? undefined : policy.decision;
  const [selected, setSelected] = useState<Set<DocumentClass>>(
    () => new Set(policy.status === "recorded" ? policy.classes : []),
  );
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formId = `required-classes-${spec.specId.replaceAll(".", "-")}`;
  const canSave = rationale.trim() !== "" && !busy;

  function toggle(id: DocumentClass, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    if (rationale.trim() === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRecord({
        decisionKey: requiredClassPolicyDecisionKey(spec.specId),
        specId: REQUIRED_CLASS_POLICY_SPEC_ID,
        value: serializeRequiredClassPolicy(selected),
        rationale: rationale.trim(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="policy-card" data-policy-spec={spec.specId}>
      <summary>
        <span className="policy-summary-title">{spec.title}</span>
        <span className={`policy-summary-state ${policyTone(policy)}`}>
          {policySummary(policy)}
        </span>
      </summary>

      <div className="policy-body">
        {currentDecision ? (
          <p className="policy-recorded-basis">
            <strong>Recorded basis:</strong> {currentDecision.rationale}{" "}
            <span className="policy-when">
              · {formatDate(currentDecision.recordedAt)}
            </span>
          </p>
        ) : null}

        {policy.status === "unrecognized" ? (
          <p className="field-error" role="alert">
            The latest recorded value “{policy.decision.value}” is not
            recognized. Record a new policy below.
          </p>
        ) : null}

        <form
          className="policy-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset className="policy-class-fieldset">
            <legend>Classes required for {spec.title}</legend>
            {DOCUMENT_CLASS_GROUPS.map((group) => (
              <div key={group.id} className="policy-class-group">
                <p className="policy-class-group-title">{group.label}</p>
                <div className="policy-class-grid">
                  {classes
                    .filter((entry) => entry.group === group.id)
                    .map((entry) => (
                      <label key={entry.id} className="policy-class-option">
                        <input
                          type="checkbox"
                          checked={selected.has(entry.id)}
                          onChange={(event) =>
                            toggle(entry.id, event.target.checked)
                          }
                        />
                        <span>{entry.label}</span>
                        <span className="policy-class-hint">
                          {classHint(entry)}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </fieldset>

          <label className="policy-rationale" htmlFor={`${formId}-rationale`}>
            Basis for required classes
            <textarea
              id={`${formId}-rationale`}
              rows={2}
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Why these classes are required for this product?"
              required
            />
          </label>
          <p className="policy-form-hint">
            Leave every class unchecked to record that this product requires no
            class. A new policy supersedes the earlier one; both remain in the
            audit trail. This policy does not decide whether any file is
            complete or authoritative.
          </p>

          <div className="button-row">
            <button type="submit" className="secondary" disabled={!canSave}>
              {busy ? "Recording…" : "Record class policy"}
            </button>
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </details>
  );
}

export function RequiredClassPolicyPanel({
  decisions,
  classes,
  onRecordDecision,
}: Props) {
  const policies = requiredClassPolicyStates(decisions);
  const specs = implementedWorkProducts();
  const recorded = specs.filter(
    (spec) => policies[spec.specId]?.status === "recorded",
  ).length;
  const unrecognized = specs.filter(
    (spec) => policies[spec.specId]?.status === "unrecognized",
  ).length;

  return (
    <Panel
      id="required-class-policy"
      eyebrow="Reviewer policy"
      title="Required plan-data classes"
      description="Optionally require classes for an implemented work product. A recorded policy blocks production until every selected class is marked applicable and has at least one file."
      aside={
        <StatusPill
          tone={
            unrecognized > 0
              ? "warning"
              : recorded === 0
                ? "muted"
                : "info"
          }
        >
          {recorded} of {specs.length} policies recorded
        </StatusPill>
      }
    >
      <p className="panel-prose">
        No class is required until a reviewer records a policy. Presence of a
        class never creates a requirement, and the gate does not decide whether
        a file is complete. Applicability and file counts are evaluated from the
        Documents stage.
      </p>

      <div className="policy-list">
        {specs.map((spec) => {
          const policy: RequiredClassPolicyState =
            policies[spec.specId] ?? { status: "not-configured" };
          const decisionId =
            policy.status === "not-configured"
              ? "none"
              : policy.decision.decisionId;
          return (
            <PolicyCard
              key={`${spec.specId}:${decisionId}`}
              spec={spec}
              policy={policy}
              classes={classes}
              onRecord={onRecordDecision}
            />
          );
        })}
      </div>
    </Panel>
  );
}
