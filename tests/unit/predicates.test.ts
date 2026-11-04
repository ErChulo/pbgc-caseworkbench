import { describe, expect, it } from "vitest";
import {
  PREDICATES,
  PredicateNotAvailableError,
  assertPredicateImplemented,
  getPredicate,
  implementedPredicates,
} from "../../src/domain/validation/predicates";

describe("validation predicate registry", () => {
  it("has unique predicate ids", () => {
    const ids = PREDICATES.map((predicate) => predicate.predicateId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cites and implements every runnable predicate", () => {
    expect(implementedPredicates().length).toBeGreaterThan(0);
    for (const predicate of implementedPredicates()) {
      expect(predicate.authority.citation).not.toBeNull();
      expect(predicate.implementedBy).not.toBeNull();
      expect(predicate.blockingReason).toBeNull();
    }
  });

  it("leaves no predicate uncited or unimplemented", () => {
    for (const predicate of PREDICATES) {
      expect(predicate.status).toBe("implemented");
      expect(predicate.authority.citation).not.toBeNull();
      expect(predicate.implementedBy).not.toBeNull();
      expect(predicate.blockingReason).toBeNull();
    }
  });

  it("refuses an unknown predicate", () => {
    expect(() => assertPredicateImplemented("pred.nope")).toThrowError(
      PredicateNotAvailableError,
    );
    expect(getPredicate("pred.nope")).toBeUndefined();
  });

  it("authorizes the required-field predicate", () => {
    expect(assertPredicateImplemented("pred.required-plan-fields").severity).toBe("blocking");
  });
});
