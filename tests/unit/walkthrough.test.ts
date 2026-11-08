import { describe, expect, it } from "vitest";
import {
  ADVANCED_TEST_SCRIPT,
  MAX_NOTE_LENGTH,
  PROTOTYPE_TEST_SCRIPT,
  WALKTHROUGH_SCRIPTS,
  currentStep,
  emptyWalkthroughRecord,
  nextStep,
  parseWalkthroughRecord,
  previousStep,
  recordNote,
  recordOutcome,
  scriptForRecord,
  serializeWalkthroughNotes,
  stepById,
  walkthroughNotesFileName,
  walkthroughProgress,
  type WalkthroughScript,
} from "../../src/app/walkthrough";

const STARTED = "2026-11-07T10:00:00.000Z";

function record(script: WalkthroughScript = PROTOTYPE_TEST_SCRIPT) {
  return emptyWalkthroughRecord(script, STARTED);
}

describe("guided test scripts", () => {
  it("registers the prototype test and the advanced test", () => {
    expect(WALKTHROUGH_SCRIPTS.map((script) => script.id)).toEqual([
      "smoke",
      "advanced",
    ]);
    expect(WALKTHROUGH_SCRIPTS.map((script) => script.label)).toEqual([
      "Prototype test",
      "Advanced test",
    ]);
    for (const script of WALKTHROUGH_SCRIPTS) {
      expect(script.duration.trim()).not.toBe("");
    }
  });

  it("is an ordered eight-step end-to-end path over real stages", () => {
    expect(PROTOTYPE_TEST_SCRIPT.steps).toHaveLength(8);
    expect(PROTOTYPE_TEST_SCRIPT.steps.map((step) => step.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(PROTOTYPE_TEST_SCRIPT.steps.map((step) => step.id)).toEqual([
      "case",
      "documents",
      "read-text",
      "cite",
      "plan",
      "document",
      "export",
      "restore",
    ]);
    // Every step names the screen it is performed on and what should appear.
    for (const step of PROTOTYPE_TEST_SCRIPT.steps) {
      expect(step.stage.length).toBeGreaterThan(0);
      expect(step.action.trim()).not.toBe("");
      expect(step.expect.trim()).not.toBe("");
    }
    // Only the two setup steps offer help; the rest must be done by hand.
    expect(
      PROTOTYPE_TEST_SCRIPT.steps
        .filter((step) => step.assist !== undefined)
        .map((step) => step.id),
    ).toEqual(["case", "documents"]);
  });

  it("adds a twelve-step advanced path over the reviewer stages", () => {
    expect(ADVANCED_TEST_SCRIPT.steps).toHaveLength(12);
    expect(ADVANCED_TEST_SCRIPT.steps.map((step) => step.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(ADVANCED_TEST_SCRIPT.steps.map((step) => step.id)).toEqual([
      "advanced-case",
      "advanced-documents",
      "verify",
      "retire",
      "reinstate",
      "rules",
      "age",
      "eprd-refusal",
      "readiness",
      "review-copy",
      "review-copy-open",
      "audit-filter",
    ]);

    for (const step of ADVANCED_TEST_SCRIPT.steps) {
      expect(step.stage.length).toBeGreaterThan(0);
      expect(step.lookAt.trim()).not.toBe("");
      expect(step.action.trim()).not.toBe("");
      expect(step.expect.trim()).not.toBe("");
    }

    // The advanced script reaches every stage the first script skips.
    expect(
      [...new Set(ADVANCED_TEST_SCRIPT.steps.map((step) => step.stage))],
    ).toEqual(
      expect.arrayContaining([
        "home",
        "evidence",
        "rules",
        "calculations",
        "reconciliation",
        "work-products",
        "review",
      ]),
    );

    // Setup is assisted only on the two opening steps; the rest are by hand.
    expect(
      ADVANCED_TEST_SCRIPT.steps
        .filter((step) => step.assist !== undefined)
        .map((step) => step.id),
    ).toEqual(["advanced-case", "advanced-documents"]);

    // One step exists to see a rule refuse rather than substitute a value.
    const refusal = stepById(ADVANCED_TEST_SCRIPT, "eprd-refusal");
    expect(refusal?.expect).toContain("2002-06-01");
    expect(refusal?.expect).toContain("No result, run id, or history entry");
  });

  it("starts on the first step with nothing recorded", () => {
    for (const script of WALKTHROUGH_SCRIPTS) {
      const state = record(script);
      expect(state.scriptId).toBe(script.id);
      expect(currentStep(script, state).number).toBe(1);
      expect(walkthroughProgress(script, state)).toEqual({
        total: script.steps.length,
        passed: 0,
        failed: 0,
        unrecorded: script.steps.length,
        complete: false,
      });
    }
  });
});

describe("recording outcomes", () => {
  it("records one outcome at a time and moves forward only when one exists", () => {
    const script = PROTOTYPE_TEST_SCRIPT;
    let state = record();
    expect(nextStep(script, state)).toBe(state);

    state = recordOutcome(script, state, "case", "fail");
    expect(state.results.case?.outcome).toBe("fail");

    state = recordOutcome(script, state, "case", "pass");
    expect(state.results.case?.outcome).toBe("pass");

    const advanced = nextStep(script, state);
    expect(currentStep(script, advanced).id).toBe("documents");
    expect(previousStep(advanced).stepIndex).toBe(0);
  });

  it("stays on the last step once it is reached", () => {
    for (const script of WALKTHROUGH_SCRIPTS) {
      let state = record(script);
      for (const step of script.steps) {
        state = recordOutcome(script, state, step.id, "pass");
        state = nextStep(script, state);
      }
      expect(currentStep(script, state).number).toBe(script.steps.length);
      expect(walkthroughProgress(script, state)).toEqual({
        total: script.steps.length,
        passed: script.steps.length,
        failed: 0,
        unrecorded: 0,
        complete: true,
      });
    }
  });

  it("does not move backwards past the first step", () => {
    const state = record();
    expect(previousStep(state)).toBe(state);
  });

  it("ignores a step id that belongs to the other script", () => {
    const state = record();
    expect(recordOutcome(PROTOTYPE_TEST_SCRIPT, state, "verify", "pass")).toBe(
      state,
    );
    expect(
      recordNote(PROTOTYPE_TEST_SCRIPT, state, "audit-filter", "text"),
    ).toBe(state);
    expect(stepById(PROTOTYPE_TEST_SCRIPT, "verify")).toBeUndefined();
    expect(stepById(ADVANCED_TEST_SCRIPT, "verify")).toBeDefined();
  });
});

describe("notes", () => {
  it("truncates a note to the limit and keeps it with its step", () => {
    const long = "x".repeat(MAX_NOTE_LENGTH + 40);
    const state = recordNote(PROTOTYPE_TEST_SCRIPT, record(), "documents", long);
    expect(state.results.documents?.note).toHaveLength(MAX_NOTE_LENGTH);
    expect(state.results.documents?.outcome).toBeNull();
  });

  it("counts pass, fail, and unrecorded steps", () => {
    const script = PROTOTYPE_TEST_SCRIPT;
    let state = record();
    state = recordOutcome(script, state, "case", "pass");
    state = recordOutcome(script, state, "documents", "fail");
    expect(walkthroughProgress(script, state)).toEqual({
      total: 8,
      passed: 1,
      failed: 1,
      unrecorded: 6,
      complete: false,
    });
  });

  it("serializes every step, its outcome, and its note without case content", () => {
    const script = PROTOTYPE_TEST_SCRIPT;
    let state = record();
    state = recordOutcome(script, state, "case", "pass");
    state = recordNote(script, state, "case", "Alias appeared.");
    state = recordOutcome(script, state, "documents", "fail");
    state = recordNote(script, state, "documents", "The PDF had no text layer.");

    const text = serializeWalkthroughNotes(script, state, {
      buildStamp: "2026-11-05",
      caseAlias: "CW-0001",
      recordedAt: "2026-11-07T10:20:00.000Z",
    });

    expect(text).toContain("PBGC Case Workbench — prototype test notes");
    expect(text).toContain("\nBuild: 2026-11-05\n");
    expect(text).toContain("Case: CW-0001");
    expect(text).toContain("1. Create the test case — PASS");
    expect(text).toContain("Note: Alias appeared.");
    expect(text).toContain("2. Add the two sample documents — FAIL");
    expect(text).toContain("Note: The PDF had no text layer.");
    expect(text).toContain("8. Restore the bundle — NOT RECORDED");
    expect(text).toContain("Summary: 1 passed, 1 failed, 6 not recorded of 8.");
    expect(text).toContain("no evidence text and no participant data");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("names the advanced script and its twelve steps in the notes", () => {
    const script = ADVANCED_TEST_SCRIPT;
    let state = record(script);
    state = recordOutcome(script, state, "verify", "pass");
    state = recordNote(script, state, "eprd-refusal", "Refused as documented.");

    const text = serializeWalkthroughNotes(script, state, {
      buildStamp: "2026-11-07",
      caseAlias: "CW-DEMO-0001",
      recordedAt: "2026-11-07T11:10:00.000Z",
    });

    expect(text).toContain("PBGC Case Workbench — advanced test notes");
    expect(text).toContain("3. Verify the stored evidence — PASS");
    expect(text).toContain("8. Confirm a calculation refuses — NOT RECORDED");
    expect(text).toContain("Note: Refused as documented.");
    expect(text).toContain("12. Filter the audit trail — NOT RECORDED");
    expect(text).toContain("Summary: 1 passed, 0 failed, 11 not recorded of 12.");
  });

  it("names the build as unknown when no stamp reached the notes", () => {
    const text = serializeWalkthroughNotes(PROTOTYPE_TEST_SCRIPT, record(), {
      buildStamp: "   ",
      caseAlias: null,
      recordedAt: "2026-11-07T10:20:00.000Z",
    });

    expect(text).toContain("Build: unknown build");
    expect(text).toContain("Case: no case open");
  });

  it("names each notes file from its script and recorded date", () => {
    expect(
      walkthroughNotesFileName(PROTOTYPE_TEST_SCRIPT, "2026-11-07T10:20:00.000Z"),
    ).toBe("prototype-test-notes-2026-11-07.txt");
    expect(
      walkthroughNotesFileName(ADVANCED_TEST_SCRIPT, "2026-11-07T10:20:00.000Z"),
    ).toBe("advanced-test-notes-2026-11-07.txt");
    expect(walkthroughNotesFileName(ADVANCED_TEST_SCRIPT, "not a date")).toBe(
      "advanced-test-notes-undated.txt",
    );
  });
});

describe("reading a persisted record", () => {
  it("round-trips a record through JSON for each script", () => {
    for (const script of WALKTHROUGH_SCRIPTS) {
      const firstStep = script.steps[0]!;
      let state = record(script);
      state = recordOutcome(script, state, firstStep.id, "pass");
      state = recordNote(script, state, firstStep.id, "Looks right.");
      state = nextStep(script, state);

      const parsed = parseWalkthroughRecord(JSON.stringify(state));
      expect(parsed).toEqual(state);
      expect(parsed && scriptForRecord(parsed).id).toBe(script.id);
    }
  });

  it("reads a record written before scripts existed as the prototype test", () => {
    const parsed = parseWalkthroughRecord(
      JSON.stringify({
        startedAt: STARTED,
        stepIndex: 1,
        results: { case: { outcome: "pass", note: "" } },
      }),
    );

    expect(parsed?.scriptId).toBe("smoke");
    expect(parsed?.results.case?.outcome).toBe("pass");
  });

  it("returns null for absent, malformed, undated, or unknown-script records", () => {
    expect(parseWalkthroughRecord(null)).toBeNull();
    expect(parseWalkthroughRecord("not json")).toBeNull();
    expect(parseWalkthroughRecord("null")).toBeNull();
    expect(parseWalkthroughRecord("[]")).toBeNull();
    expect(parseWalkthroughRecord(JSON.stringify({ stepIndex: 2 }))).toBeNull();
    expect(
      parseWalkthroughRecord(
        JSON.stringify({ startedAt: "yesterday", stepIndex: 2 }),
      ),
    ).toBeNull();
    expect(
      parseWalkthroughRecord(
        JSON.stringify({ scriptId: "extended", startedAt: STARTED }),
      ),
    ).toBeNull();
  });

  it("clamps a stale index and drops results for steps that no longer exist", () => {
    const parsed = parseWalkthroughRecord(
      JSON.stringify({
        scriptId: "smoke",
        startedAt: STARTED,
        stepIndex: 99,
        results: {
          case: { outcome: "pass", note: "kept" },
          "retired-step": { outcome: "pass", note: "dropped" },
        },
      }),
    );

    expect(parsed).not.toBeNull();
    expect(currentStep(PROTOTYPE_TEST_SCRIPT, parsed!).id).toBe("restore");
    expect(parsed!.results.case).toEqual({ outcome: "pass", note: "kept" });
    expect(parsed!.results["retired-step"]).toBeUndefined();
  });

  it("keeps only the steps of the script the record names", () => {
    const parsed = parseWalkthroughRecord(
      JSON.stringify({
        scriptId: "advanced",
        startedAt: STARTED,
        stepIndex: 2,
        results: {
          verify: { outcome: "fail", note: "not verified" },
          case: { outcome: "pass", note: "from the other script" },
        },
      }),
    );

    expect(parsed).not.toBeNull();
    expect(scriptForRecord(parsed!).id).toBe("advanced");
    expect(currentStep(ADVANCED_TEST_SCRIPT, parsed!).id).toBe("verify");
    expect(parsed!.results.verify).toEqual({
      outcome: "fail",
      note: "not verified",
    });
    expect(parsed!.results.case).toBeUndefined();
  });

  it("rejects an outcome it does not recognize", () => {
    const parsed = parseWalkthroughRecord(
      JSON.stringify({
        startedAt: STARTED,
        stepIndex: 0,
        results: { case: { outcome: "maybe", note: 7 } },
      }),
    );

    expect(parsed?.results.case).toEqual({ outcome: null, note: "" });
  });
});
