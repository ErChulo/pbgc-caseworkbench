import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RULES,
  RuleNotAvailableError,
  assertRuleImplemented,
  getRule,
  implementedRules,
  unresolvedRules,
} from "../../src/domain/rules/registry";

describe("rule registry integrity", () => {
  it("has unique rule ids", () => {
    const ids = RULES.map((rule) => rule.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships both runnable identities and blocked PBGC provisions", () => {
    expect(implementedRules().length).toBeGreaterThan(0);
    expect(unresolvedRules().length).toBeGreaterThan(0);
  });

  it("gives every implemented rule a citation and an implementation file", () => {
    for (const rule of implementedRules()) {
      expect(rule.authority.citation).not.toBeNull();
      expect(rule.blockingReason).toBeNull();
      expect(rule.implementedBy).not.toBeNull();
      expect(existsSync(rule.implementedBy ?? "")).toBe(true);
    }
  });

  it("gives every unresolved rule a blocking reason and no implementation", () => {
    for (const rule of unresolvedRules()) {
      expect(rule.blockingReason).toBeTruthy();
      expect(rule.implementedBy).toBeNull();
      expect(rule.formula).toBeNull();
    }
  });

  it("keeps the two sets disjoint", () => {
    const implemented = new Set(implementedRules().map((rule) => rule.ruleId));
    for (const rule of unresolvedRules()) {
      expect(implemented.has(rule.ruleId)).toBe(false);
    }
  });

  it("refuses to run an unresolved PBGC provision", () => {
    for (const rule of unresolvedRules()) {
      expect(() => assertRuleImplemented(rule.ruleId)).toThrowError(RuleNotAvailableError);
      try {
        assertRuleImplemented(rule.ruleId);
      } catch (error) {
        expect((error as Error).message).toContain(rule.blockingReason ?? "");
      }
    }
  });

  it("refuses an unknown rule id", () => {
    expect(() => assertRuleImplemented("pbgc:does-not-exist")).toThrowError(
      RuleNotAvailableError,
    );
    expect(getRule("pbgc:does-not-exist")).toBeUndefined();
  });

  it("authorizes the calendar age identity", () => {
    const rule = assertRuleImplemented("identity:calendar-completed-years");
    expect(rule.status).toBe("implemented");
    expect(rule.authority.citation).toBeTruthy();
  });
});
