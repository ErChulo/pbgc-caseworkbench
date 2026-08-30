import { describe, expect, it } from "vitest";
import { runCaseStoreContractTests } from "./caseStoreContract";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";

runCaseStoreContractTests("InMemoryCaseStore", () => new InMemoryCaseStore());

describe("InMemoryCaseStore isolation", () => {
  it("each instance has independent state", async () => {
    const a = new InMemoryCaseStore();
    const b = new InMemoryCaseStore();
    await a.createCase({
      caseId: "a1",
      alias: "CW-0001",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const aCases = await a.listCases();
    const bCases = await b.listCases();
    expect(aCases).toHaveLength(1);
    expect(bCases).toHaveLength(0);
  });
});
