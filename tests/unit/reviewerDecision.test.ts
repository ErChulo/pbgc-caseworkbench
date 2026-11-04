import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { CaseService } from "../../src/app/CaseService";
import { catalog } from "../../src/app/catalog";

function makeService(): { store: InMemoryCaseStore; service: CaseService } {
  const store = new InMemoryCaseStore();
  return { store, service: new CaseService(store, catalog) };
}

async function openSyntheticCase(): Promise<{
  store: InMemoryCaseStore;
  service: CaseService;
  caseId: string;
}> {
  const { store, service } = makeService();
  const record = await service.createCase();
  return { store, service, caseId: record.caseId };
}

describe("reviewer decisions", () => {
  it("records a decision and audits it", async () => {
    const { service, caseId } = await openSyntheticCase();
    const saved = await service.recordDecision({
      caseId,
      decisionKey: "r5.decision.actuary",
      specId: "wp.r5-plan-summary",
      value: "Synthetic Actuary",
      rationale: "Synthetic decision for the offline test.",
    });

    expect(saved.decisionKey).toBe("r5.decision.actuary");
    expect(saved.value).toBe("Synthetic Actuary");
    expect(saved.supersedes).toBeUndefined();

    const decisions = await service.getDecisions(caseId);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.decisionId).toBe(saved.decisionId);

    const events = await service.getAuditEvents(caseId);
    const recorded = events.find(
      (event) => event.eventType === "reviewer-decision-recorded",
    );
    expect(recorded).toBeDefined();
    expect(recorded?.refs.decisionId).toBe(saved.decisionId);
    expect(recorded?.after).toBe("Synthetic Actuary");
  });

  it("supersedes a decision without erasing it", async () => {
    const { service, caseId } = await openSyntheticCase();
    const first = await service.recordDecision({
      caseId,
      decisionKey: "r5.decision.item-01",
      specId: "wp.r5-plan-summary",
      value: "March 1, 2015",
      rationale: "Synthetic plan document, page 1.",
    });
    const second = await service.recordDecision({
      caseId,
      decisionKey: "r5.decision.item-01",
      specId: "wp.r5-plan-summary",
      value: "April 1, 2015",
      rationale: "Corrected after re-reading the synthetic amendment.",
    });

    expect(second.supersedes).toBe(first.decisionId);
    const decisions = await service.getDecisions(caseId);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]?.value).toBe("March 1, 2015");
    expect(decisions[1]?.value).toBe("April 1, 2015");

    const corrections = (await service.getAuditEvents(caseId)).filter(
      (event) => event.eventType === "reviewer-decision-recorded",
    );
    expect(corrections).toHaveLength(2);
    expect(corrections[1]?.before).toBe("March 1, 2015");
  });

  it("fails closed without a value or a rationale", async () => {
    const { service, caseId } = await openSyntheticCase();
    await expect(
      service.recordDecision({
        caseId,
        decisionKey: "r5.decision.actuary",
        specId: "wp.r5-plan-summary",
        value: "  ",
        rationale: "Synthetic.",
      }),
    ).rejects.toThrow(/value/);
    await expect(
      service.recordDecision({
        caseId,
        decisionKey: "r5.decision.actuary",
        specId: "wp.r5-plan-summary",
        value: "Synthetic Actuary",
        rationale: "",
      }),
    ).rejects.toThrow(/rationale/);
    expect(await service.getDecisions(caseId)).toEqual([]);
  });

  it("refuses a decision for an unknown case", async () => {
    const { service } = makeService();
    await expect(
      service.recordDecision({
        caseId: "missing-case",
        decisionKey: "r5.decision.actuary",
        specId: "wp.r5-plan-summary",
        value: "Synthetic Actuary",
        rationale: "Synthetic.",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("trims recorded values", async () => {
    const { service, caseId } = await openSyntheticCase();
    const saved = await service.recordDecision({
      caseId,
      decisionKey: "r5.decision.auditor",
      specId: "wp.r5-plan-summary",
      value: "  Synthetic Auditor  ",
      rationale: "  Synthetic rationale.  ",
    });
    expect(saved.value).toBe("Synthetic Auditor");
    expect(saved.rationale).toBe("Synthetic rationale.");
  });
});
