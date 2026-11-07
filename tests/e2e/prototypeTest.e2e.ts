import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/**
 * The prototype test as the office reviewer will run it: eight steps over the
 * real stages, navigated with the panel's own controls. Every action here is a
 * click a reviewer would make; nothing reaches into app internals.
 */

function panel(page: Page) {
  return page.locator(".prototype-test");
}

async function expectStep(page: Page, title: string, progressText: string) {
  const section = panel(page);
  await expect(
    section.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(section.getByText(progressText, { exact: false })).toBeVisible();
  return section;
}

test("runs the eight-step prototype test and records the results", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Run the 15-minute prototype test" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start the prototype test" }).click();

  // Step 1 — the panel starts at the top of the script and refuses to advance
  // before the reviewer records a result.
  let section = await expectStep(page, "1. Create the test case", "Step 1 of 8");
  await expect(section.getByRole("button", { name: "Next step" })).toBeDisabled();

  await section.getByRole("button", { name: "Create the test case" }).click();
  await expect(page.locator(".case-bar")).toContainText("CW-DEMO-0001");
  await expect(
    page.getByText(/created for the prototype test/),
  ).toBeVisible();

  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await expect(
    section.getByRole("button", { name: "Pass", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 2 — the assisted import calls the ordinary evidence import action.
  section = await expectStep(
    page,
    "2. Add the two sample documents",
    "Step 2 of 8 · 1 passed",
  );
  await section
    .getByRole("button", { name: "Add the two sample documents" })
    .click();
  await expect(
    page.getByText("synthetic-plan-document.pdf", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("synthetic-plan-summary.docx", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/synthetic-plan-document\.pdf: imported\./),
  ).toBeVisible();

  // Both samples arrive through the ordinary intake path, already typed.
  const pdfCard = page
    .locator(".artifact-card")
    .filter({ hasText: "synthetic-plan-document.pdf" });
  const docxCard = page
    .locator(".artifact-card")
    .filter({ hasText: "synthetic-plan-summary.docx" });
  await expect(pdfCard.locator(".artifact-class")).toHaveText(
    "Plan document set",
  );
  await expect(docxCard.locator(".artifact-class")).toHaveText(
    "Plan document set",
  );

  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 3 — reading uses the PDF's own text layer.
  section = await expectStep(page, "3. Read the PDF text", "Step 3 of 8");
  await pdfCard.getByRole("button", { name: "Read text" }).click();
  const extracted = pdfCard.locator(".extracted-text");
  await expect(
    extracted.getByText("Synthetic Retiree Plan - Plan Document Extract"),
  ).toBeVisible();
  await expect(extracted.getByText("Page 1", { exact: true })).toBeVisible();
  await expect(extracted.getByText("Page 2", { exact: true })).toBeVisible();

  await section.getByRole("button", { name: "Pass", exact: true }).click();

  // The record is a browser record, not case data: a reload keeps the step and
  // its outcome while the case is restored from IndexedDB.
  await page.reload();
  section = await expectStep(page, "3. Read the PDF text", "Step 3 of 8");
  await expect(
    section.getByRole("button", { name: "Pass", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 4 — citing records a source pointer, not a value.
  section = await expectStep(page, "4. Cite a passage", "Step 4 of 8");
  await expect(
    page.getByRole("heading", {
      name: "Add the plan's source documents",
      exact: true,
    }),
  ).toBeVisible();
  const citationPanel = page.locator(".extracted-text");
  await citationPanel
    .getByLabel("Cite a passage for")
    .selectOption({ index: 1 });
  await citationPanel.getByRole("button", { name: "Cite Page 1" }).click();
  await expect(citationPanel.getByText(/Cited for /)).toBeVisible();

  await section.getByRole("button", { name: "Fail", exact: true }).click();
  await section
    .getByLabel("Note for this step (optional)")
    .fill("Passage citation was recorded; the locator label is hard to read.");
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 5 — the plan summary, reached by the panel's own navigation.
  section = await expectStep(page, "5. Review the plan summary", "Step 5 of 8");
  await expect(
    page.getByRole("heading", { name: "Plan-level fields", exact: true }),
  ).toBeVisible();
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 6 — the derived document.
  section = await expectStep(
    page,
    "6. Download the final document",
    "Step 6 of 8 · 4 passed · 1 failed",
  );
  await expect(
    page.getByRole("heading", { name: "Your plan summary", exact: true }),
  ).toBeVisible();
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 7 — the bundle export.
  section = await expectStep(
    page,
    "7. Export the review bundle",
    "Step 7 of 8",
  );
  await expect(
    page.getByRole("heading", { name: "Case bundle", exact: true }),
  ).toBeVisible();
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 8 — the restore control. The script stays on the last step.
  section = await expectStep(page, "8. Restore the bundle", "Step 8 of 8");
  await expect(
    section.getByRole("heading", { name: "8. Restore the bundle" }),
  ).toBeVisible();
  await expect(section.getByRole("button", { name: "Next step" })).toHaveCount(0);
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await expect(
    section.getByText("All eight steps have a result.", { exact: false }),
  ).toBeVisible();

  // Notes carry the recorded outcomes and note, and no evidence text.
  const downloadPromise = page.waitForEvent("download");
  await section.getByRole("button", { name: "Download test notes" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^prototype-test-notes-\d{4}-\d{2}-\d{2}\.txt$/,
  );
  const path = await download.path();
  expect(path).not.toBeNull();
  const notes = await readFile(path!, "utf8");
  // The notes name the artifact that ran the test, not just the session.
  expect(notes).toMatch(/^Build: \d{4}-\d{2}-\d{2}$/m);
  expect(notes).toContain("Case: CW-DEMO-0001");
  expect(notes).toContain("4. Cite a passage — FAIL");
  expect(notes).toContain(
    "Note: Passage citation was recorded; the locator label is hard to read.",
  );
  expect(notes).toContain("8. Restore the bundle — PASS");
  expect(notes).toContain("Summary: 7 passed, 1 failed, 0 not recorded of 8.");
  expect(notes).not.toContain("Synthetic Retiree Plan - Plan Document Extract");
  expect(notes).not.toContain("synthetic-plan-document.pdf");

  // Restart clears the session record but leaves the case and its evidence.
  page.once("dialog", (dialog) => void dialog.accept());
  await section.getByRole("button", { name: "Restart" }).click();
  section = await expectStep(
    page,
    "1. Create the test case",
    "Step 1 of 8 · 0 passed · 0 failed · 8 not recorded",
  );
  await expect(
    page.getByText("CW-DEMO-0001", { exact: false }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Exit test" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator("button.rail-test-button")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("opens on step 1 from any screen and can switch to the demo case", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");

  // Start from a plain case, on its plan screen, so the test both begins away
  // from Case home and meets a case that has no reviewed plan value.
  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan-level fields", exact: true }),
  ).toBeVisible();

  await page.locator("button.rail-test-button").click();
  let section = panel(page);
  await expect(
    section.getByRole("heading", { name: "1. Create the test case" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A case that stays on this workstation" }),
  ).toBeVisible();

  // The kept case has no reviewed value, so the panel says what step 4 needs
  // and still offers the test case.
  await expect(
    section.getByText("Keep it only if it has a reviewed plan value", {
      exact: false,
    }),
  ).toBeVisible();
  await section.getByRole("button", { name: "Create the test case" }).click();
  await expect(page.locator(".case-bar")).toContainText("CW-DEMO-0001");
  await expect(page.getByText(/created for the prototype test/)).toBeVisible();

  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();
  await section
    .getByRole("button", { name: "Add the two sample documents" })
    .click();
  await expect(
    page.getByText("synthetic-plan-document.pdf", { exact: true }),
  ).toBeVisible();
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  const pdfCard = page
    .locator(".artifact-card")
    .filter({ hasText: "synthetic-plan-document.pdf" });
  await pdfCard.getByRole("button", { name: "Read text" }).click();
  await expect(pdfCard.getByText("Page 1", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 4 is possible because the demo case carries reviewed plan values.
  section = await expectStep(page, "4. Cite a passage", "Step 4 of 8");
  const citationPanel = pdfCard.locator(".extracted-text");
  await citationPanel
    .getByLabel("Cite a passage for")
    .selectOption({ index: 1 });
  await citationPanel.getByRole("button", { name: "Cite Page 1" }).click();
  await expect(citationPanel.getByText(/Cited for /)).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
