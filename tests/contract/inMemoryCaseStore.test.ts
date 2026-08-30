import { describe, expect, it } from "vitest";
import { runCaseStoreContractTests, seedCase } from "./caseStoreContract";
import { InMemoryCaseStore } from "../../src/adapters/storage/InMemoryCaseStore";

runCaseStoreContractTests("InMemoryCaseStore", () => new InMemoryCaseStore());

describe("InMemoryCaseStore isolation", () => {
  it("each instance has independent state", async () => {
    const a = new InMemoryCaseStore();
    const b = new InMemoryCaseStore();
    await seedCase(a, "a1", "CW-0001");
    const aCases = await a.listCases();
    const bCases = await b.listCases();
    expect(aCases).toHaveLength(1);
    expect(bCases).toHaveLength(0);
  });
});
