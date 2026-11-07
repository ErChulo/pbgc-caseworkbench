import { describe, expect, it } from "vitest";
import {
  MAX_NOTE_LENGTH,
  WALKTHROUGH_STEPS,
  currentStep,
  emptyWalkthroughRecord,
  nextStep,
  parseWalkthroughRecord,
  previousStep,
  recordNote,
  recordOutcome,
  serializeWalkthroughNotes,
  stepById,
  walkthroughNotesFileName,
  walkthroughProgress,
} from "../../src/app/walkthrough";

const STARTED = "2026-11-07T10:00:00.000Z";

function record() {
  return emptyWalkthroughRecord(STARTED);
}

describe("prototype test steps", () => {
  it("is an ordered eight-step end-to-end path over real stages", () => {
    expect(WALKTHROUGH_STEPS).toHaveLength(8);
    expect(WALKTHROUGH_STEPS.map((step) => step.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(WALKTHROUGH_STEPS.map((step) => step.id)).toEqual([
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
    for (const step of WALKTHROUGH_STEPS) {
      expect(step.stage.length).toBeGreaterThan(0);
      expect(step.action.trim()).not.toBe("");
      expect(step.expect.trim()).not.toBe("");
    }
    // Only the two setup steps offer help; the rest must be done by hand.
    expect(
      WALKTHROUGH_STEPS.filter((step) => step.assist !== undefined).map(
        (step) => step.id,
      ),
    ).toEqual(["case", "documents"]);
  });

  it("starts on the first step with nothing recorded", () => {
    const state = record();
    expect(currentStep(state).id).toBe("case");
    expect(walkthroughProgress(state)).toEqual({
      total: 8,
      passed: 0,
      failed: 0,
      unrecorded: 8,
      complete: false,
    });
  });
});

describe("recording outcomes", () => {
  it("records one outcome at a time and moves forward only when one exists", () => {
    let state = record();
    expect(nextStep(state)).toBe(state);

    state = recordOutcome(state, "case", "fail");
    expect(state.results.case?.outcome).toBe("fail");

    state = recordOutcome(state, "case", "pass");
    expect(state.results.case?.outcome).toBe("pass");

    const advanced = nextStep(state);
    expect(currentStep(advanced).id).toBe("documents");
    expect(previousStep(advanced).stepIndex).toBe(0);
  });

  it("stays on the last step once it is reached", () => {
    let state = record();
    for (const step of WALKTHROUGH_STEPS) {
      state = recordOutcome(state, step.id, "pass");
      state = nextStep(state);
    }
    expect(currentStep(state).id).toBe("restore");
    expect(walkthroughProgress(state)).toEqual({
      total: 8,
      passed: 8,
      failed: 0,
      unrecorded: 0,
      complete: true,
    });
  });

  it("does not move backwards past the first step", () => {
    const state = record();
    expect(previousStep(state)).toBe(state);
  });

  it("ignores an unknown step id", () => {
    const state = record();
    expect(recordOutcome(state, "not-a-step", "pass")).toBe(state);
    expect(recordNote(state, "not-a-step", "text")).toBe(state);
    expect(stepById("not-a-step")).toBeUndefined();
  });
});

describe("notes", () => {
  it("truncates a note to the limit and keeps it with its step", () => {
    const long = "x".repeat(MAX_NOTE_LENGTH + 40);
    const state = recordNote(record(), "documents", long);
    expect(state.results.documents?.note).toHaveLength(MAX_NOTE_LENGTH);
    expect(state.results.documents?.outcome).toBeNull();
  });

  it("counts pass, fail, and unrecorded steps", () => {
    let state = record();
    state = recordOutcome(state, "case", "pass");
    state = recordOutcome(state, "documents", "fail");
    expect(walkthroughProgress(state)).toEqual({
      total: 8,
      passed: 1,
      failed: 1,
      unrecorded: 6,
      complete: false,
    });
  });

  it("serializes every step, its outcome, and its note without case content", () => {
    let state = record();
    state = recordOutcome(state, "case", "pass");
    state = recordNote(state, "case", "Alias appeared.");
    state = recordOutcome(state, "documents", "fail");
    state = recordNote(state, "documents", "The PDF had no text layer.");

    const text = serializeWalkthroughNotes(state, {
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
    expect(text).toContain(
      "Summary: 1 passed, 1 failed, 6 not recorded of 8.",
    );
    expect(text).toContain("no evidence text and no participant data");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("names the build as unknown when no stamp reached the notes", () => {
    const text = serializeWalkthroughNotes(record(), {
      buildStamp: "   ",
      caseAlias: null,
      recordedAt: "2026-11-07T10:20:00.000Z",
    });

    expect(text).toContain("Build: unknown build");
    expect(text).toContain("Case: no case open");
  });

  it("names the notes file from the recorded date", () => {
    expect(walkthroughNotesFileName("2026-11-07T10:20:00.000Z")).toBe(
      "prototype-test-notes-2026-11-07.txt",
    );
    expect(walkthroughNotesFileName("not a date")).toBe(
      "prototype-test-notes-undated.txt",
    );
  });
});

describe("reading a persisted record", () => {
  it("round-trips a record through JSON", () => {
    let state = record();
    state = recordOutcome(state, "case", "pass");
    state = recordNote(state, "case", "Looks right.");
    state = nextStep(state);

    expect(parseWalkthroughRecord(JSON.stringify(state))).toEqual(state);
  });

  it("returns null for absent, malformed, or undated records", () => {
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
  });

  it("clamps a stale index and drops results for steps that no longer exist", () => {
    const parsed = parseWalkthroughRecord(
      JSON.stringify({
        startedAt: STARTED,
        stepIndex: 99,
        results: {
          case: { outcome: "pass", note: "kept" },
          "retired-step": { outcome: "pass", note: "dropped" },
        },
      }),
    );

    expect(parsed).not.toBeNull();
    expect(currentStep(parsed!).id).toBe("restore");
    expect(parsed!.results.case).toEqual({ outcome: "pass", note: "kept" });
    expect(parsed!.results["retired-step"]).toBeUndefined();
  });

  it("rejects an outcome it does not recognize", () => {
    const parsed = parseWalkthroughRecord(
      JSON.stringify({
        startedAt: STARTED,
        stepIndex: 0,
        results: { case: { outcome: "maybe", note: 7 } },
      }),
    );
    expect(parsed!.results.case).toEqual({ outcome: null, note: "" });
  });
});
