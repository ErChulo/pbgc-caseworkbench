import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";
import { CalculationService } from "../../src/app/CalculationService";
import { CaseService } from "../../src/app/CaseService";
import { catalog } from "../../src/app/catalog";
import { computeEarliestPbgcRetirementDate } from "../../src/domain/calculations/earliestRetirement";

const DOPT = "2020-06-30";

describe("earliest PBGC retirement date", () => {
  it("uses the Earliest Annuity Date when it is on or after age 55", () => {
    const result = computeEarliestPbgcRetirementDate({
      dateOfBirth: "1950-01-15",
      earliestAnnuityDate: "2015-01-15",
      dopt: DOPT,
    });
    expect(result.value).toBe("2015-01-15");
    expect(result.basis).toBe("earliest-annuity-date");
    expect(result.factsAndCircumstancesRequired).toBe(false);
    expect(result.intermediates.age55Date).toBe("2005-01-15");
  });

  it("applies the age-55 floor when the Earliest Annuity Date is earlier", () => {
    const result = computeEarliestPbgcRetirementDate({
      dateOfBirth: "1950-01-15",
      earliestAnnuityDate: "2000-01-01",
      dopt: DOPT,
    });
    expect(result.value).toBe("2005-01-15");
    expect(result.basis).toBe("age-55-floor");
    expect(result.factsAndCircumstancesRequired).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/facts-and-circumstances/i);
  });

  it("clamps a leap-day birth date instead of rolling into March", () => {
    const result = computeEarliestPbgcRetirementDate({
      dateOfBirth: "1952-02-29",
      earliestAnnuityDate: "1975-01-01",
      dopt: DOPT,
    });
    expect(result.intermediates.age55Date).toBe("2007-02-28");
    expect(result.value).toBe("2007-02-28");
  });

  it("refuses a DOPT before the guidance's effective date", () => {
    expect(() =>
      computeEarliestPbgcRetirementDate({
        dateOfBirth: "1950-01-15",
        earliestAnnuityDate: "2000-01-01",
        dopt: "2002-05-31",
      }),
    ).toThrow(/2002-06-01/);
  });

  it("applies on the effective date itself", () => {
    const result = computeEarliestPbgcRetirementDate({
      dateOfBirth: "1950-01-15",
      earliestAnnuityDate: "2000-01-01",
      dopt: "2002-06-01",
    });
    expect(result.value).toBe("2005-01-15");
  });

  it("accepts a reviewer facts-and-circumstances date within the guidance's bounds", () => {
    const result = computeEarliestPbgcRetirementDate({
      dateOfBirth: "1950-01-15",
      earliestAnnuityDate: "2000-01-01",
      dopt: DOPT,
      earlierRetirementDate: "2002-03-01",
    });
    expect(result.value).toBe("2002-03-01");
    expect(result.basis).toBe("reviewer-earlier-date");
    expect(result.factsAndCircumstancesRequired).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/reviewer decision/i);
  });

  it("refuses an earlier date that precedes the Earliest Annuity Date", () => {
    expect(() =>
      computeEarliestPbgcRetirementDate({
        dateOfBirth: "1950-01-15",
        earliestAnnuityDate: "2001-01-01",
        dopt: DOPT,
        earlierRetirementDate: "2000-06-01",
      }),
    ).toThrow(/never be earlier/i);
  });

  it("refuses an earlier date after the age-55 floor", () => {
    expect(() =>
      computeEarliestPbgcRetirementDate({
        dateOfBirth: "1950-01-15",
        earliestAnnuityDate: "2000-01-01",
        dopt: DOPT,
        earlierRetirementDate: "2006-01-01",
      }),
    ).toThrow(/only move the EPRD earlier/i);
  });

  it("fails closed on a missing Earliest Annuity Date", () => {
    expect(() =>
      computeEarliestPbgcRetirementDate({
        dateOfBirth: "1950-01-15",
        earliestAnnuityDate: "",
        dopt: DOPT,
      }),
    ).toThrow(/Earliest Annuity Date is missing/);
  });

  it("warns when the inputs have no evidence provenance", () => {
    const result = computeEarliestPbgcRetirementDate({
      dateOfBirth: "1950-01-15",
      earliestAnnuityDate: "2000-01-01",
      dopt: DOPT,
    });
    expect(result.warnings.join(" ")).toMatch(/no evidence link/i);
    expect(result.inputs.every((input) => input.provenanceIds.length === 0)).toBe(true);
  });
});

describe("EPRD calculation service", () => {
  async function setup() {
    const store = new InMemoryCaseStore();
    const caseService = new CaseService(store, catalog);
    const record = await caseService.createCase();
    return { store, service: new CalculationService(store), caseId: record.caseId };
  }

  it("records the EPRD run and its result in the audit trail", async () => {
    const { store, service, caseId } = await setup();
    const run = await service.runEarliestPbgcRetirementDate({
      caseId,
      dateOfBirth: "1950-01-15",
      earliestAnnuityDate: "2000-01-01",
      dopt: DOPT,
    });

    expect(run.result.value).toBe("2005-01-15");
    const events = await store.getAuditEvents(caseId);
    const calculation = events.find(
      (event) => event.eventType === "calculation-run" && event.refs.runId === run.runId,
    );
    expect(calculation).toBeDefined();
    expect(calculation?.after).toBe("2005-01-15");
    expect(calculation?.component).toContain("pbgc:earliest-retirement-date");
  });

  it("writes no audit event when the guidance does not apply", async () => {
    const { store, service, caseId } = await setup();
    const before = await store.getAuditEvents(caseId);

    await expect(
      service.runEarliestPbgcRetirementDate({
        caseId,
        dateOfBirth: "1950-01-15",
        earliestAnnuityDate: "2000-01-01",
        dopt: "1998-08-24",
      }),
    ).rejects.toThrow(/2002-06-01/);

    expect(await store.getAuditEvents(caseId)).toHaveLength(before.length);
  });
});
