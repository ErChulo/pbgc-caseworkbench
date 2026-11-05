import { describe, expect, it } from "vitest";
import { R5_TEMPLATE_MANIFEST } from "../../src/domain/work-products/r5/manifest";
import {
  r5DecisionSections,
  r5QuestionTotals,
} from "../../src/domain/work-products/r5/questions";

const expectedQuestions = R5_TEMPLATE_MANIFEST.placeholders.filter(
  (placeholder) => placeholder.source.kind === "reviewer-decision",
).length;

describe("guided R5 questions", () => {
  it("includes every reviewer-decision cell and no fact, calculation, or blocked cell", () => {
    const sections = r5DecisionSections({});
    const questions = sections.flatMap((section) => section.questions);
    const keys = new Set(questions.map((question) => question.decisionKey));

    expect(questions).toHaveLength(expectedQuestions);
    expect(questions).toHaveLength(71);
    expect(keys.has("r5.decision.item-01")).toBe(true);
    expect(keys.has("r5.decision.item-60")).toBe(true);
    expect(keys.has("r5.decision.actuary")).toBe(true);
    expect(keys.has("r5.dotr")).toBe(false);
    expect(keys.has("r5.plan-name")).toBe(false);
    expect(keys.has("r5.sparr")).toBe(false);
  });

  it("uses the shell's own question for plan provisions", () => {
    const sections = r5DecisionSections({});
    const item = sections
      .flatMap((section) => section.questions)
      .find((question) => question.decisionKey === "r5.decision.item-01");

    expect(item).toMatchObject({
      section: "Plan Provisions",
      label: "Adoption Date",
      question: "What is the Adoption Date of the document?",
      note: null,
      value: null,
      answered: false,
    });
  });

  it("turns header labels into readable prompts and keeps their constraints", () => {
    const sections = r5DecisionSections({});
    const actuary = sections
      .flatMap((section) => section.questions)
      .find((question) => question.decisionKey === "r5.decision.actuary");
    const funding = sections
      .flatMap((section) => section.questions)
      .find((question) => question.decisionKey === "r5.decision.funding-status");

    expect(actuary?.question).toBe("Who is the actuary preparing this summary?");
    expect(funding?.question).toBe("What is the plan's funding status?");
    expect(funding?.note).toContain("Insufficient");

    const caseProcessing = sections
      .flatMap((section) => section.questions)
      .find(
        (question) =>
          question.decisionKey === "r5.decision.case-processing-section",
      );
    expect(caseProcessing?.note).toBeNull();
  });

  it("reads the latest recorded answer and counts progress by section", () => {
    const sections = r5DecisionSections({
      "r5.decision.actuary": "  A. Reviewer  ",
      "r5.decision.item-01": "January 1, 2005",
    });
    const totals = r5QuestionTotals(sections);

    expect(totals).toEqual({ answered: 2, total: expectedQuestions });
    const planProvisions = sections.find(
      (section) => section.section === "Plan Provisions",
    );
    expect(planProvisions).toMatchObject({ answered: 1, total: 3 });
    expect(
      sections
        .flatMap((section) => section.questions)
        .find((question) => question.decisionKey === "r5.decision.actuary")?.value,
    ).toBe("A. Reviewer");
  });

  it("treats a blank recorded value as unanswered", () => {
    const sections = r5DecisionSections({ "r5.decision.actuary": "   " });
    expect(r5QuestionTotals(sections).answered).toBe(0);
  });
});
