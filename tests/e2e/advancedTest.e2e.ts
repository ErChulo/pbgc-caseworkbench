import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/**
 * The advanced test as a reviewer runs it: twelve steps over the real stages,
 * navigated with the panel's own controls. Every action here is a click a
 * reviewer would make; nothing reaches into app internals.
 */

function panel(page: Page) {
  return page.locator(".prototype-test");
}

async function expectStep(
  page: Page,
  number: number,
  title: string,
  progressText: string,
) {
  const section = panel(page);
  await expect(
    section.getByRole("heading", { name: `${number}. ${title}`, exact: true }),
  ).toBeVisible();
  await expect(section.getByText(progressText, { exact: false })).toBeVisible();
  return section;
}

test("runs the twelve-step advanced test and records the results", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Test the workbench yourself" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start the 30-minute advanced test" }).click();

  // Step 1 — the script opens at its first step on Case home.
  let section = await expectStep(
    page,
    1,
    "Create the test case",
    "Step 1 of 12",
  );
  await section.getByRole("button", { name: "Create the test case" }).click();
  await expect(page.locator(".case-bar")).toContainText("CW-DEMO-0001");
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 2 — the same assisted import the first test uses.
  section = await expectStep(
    page,
    2,
    "Add the two sample documents",
    "Step 2 of 12",
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
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 3 — re-hashing the stored bytes is a case action, not a test record.
  section = await expectStep(page, 3, "Verify the stored evidence", "Step 3 of 12");
  await page.getByRole("button", { name: "Verify active evidence" }).click();
  await expect(
    page.getByText(/Verified 2 stored evidence files against the recorded SHA-256/),
  ).toBeVisible();
  const pdfCard = page
    .locator(".artifact-card")
    .filter({ hasText: "synthetic-plan-document.pdf" });
  const docxCard = page
    .locator(".artifact-card")
    .filter({ hasText: "synthetic-plan-summary.docx" });
  await expect(
    page.locator(".artifact-card").getByText("Integrity: verified"),
  ).toHaveCount(2);
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 4 — retirement keeps the file, its hash, and its audit trail.
  section = await expectStep(
    page,
    4,
    "Retire the summary document",
    "Step 4 of 12 · 3 passed",
  );
  await docxCard.getByRole("button", { name: "Retire…" }).click();
  await docxCard
    .getByLabel("Reason for retiring this file")
    .fill("Advanced test: checking retirement");
  await docxCard.getByRole("button", { name: "Retire file" }).click();
  const retiredCard = page
    .locator(".artifact-card.retired")
    .filter({ hasText: "synthetic-plan-summary.docx" });
  await expect(retiredCard).toBeVisible();
  await expect(retiredCard).toContainText(
    "Reason: Advanced test: checking retirement",
  );
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 5 — reinstatement restores the same bytes and hash.
  section = await expectStep(
    page,
    5,
    "Return the document to active evidence",
    "Step 5 of 12 · 4 passed",
  );
  await retiredCard
    .getByRole("button", { name: "Return to active evidence" })
    .click();
  await expect(
    page.getByRole("list", { name: "Active evidence" }).getByText(
      "synthetic-plan-summary.docx",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Retired evidence" }),
  ).toHaveCount(0);
  await section.getByRole("button", { name: "Pass", exact: true }).click();

  // The record is a browser record under its own script: a reload keeps the
  // step, the outcome, and the advanced script.
  await page.reload();
  section = await expectStep(
    page,
    5,
    "Return the document to active evidence",
    "Step 5 of 12",
  );
  await expect(
    section.getByRole("button", { name: "Pass", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 6 — the registry names what may run and what is blocked.
  section = await expectStep(page, 6, "Read the rule registry", "Step 6 of 12");
  await expect(
    page.getByRole("heading", { name: "Rules available to calculations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Provisions that cannot be calculated yet",
    }),
  ).toBeVisible();
  await expect(page.getByText("No assumption set registered")).toBeVisible();
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 7 — a recorded run with units, rule, and trace.
  section = await expectStep(page, 7, "Run an age calculation", "Step 7 of 12");
  await page.getByLabel("Participant date of birth").fill("1960-06-15");
  await page.getByLabel("As-of date").fill("2025-06-14");
  await page.getByRole("button", { name: "Run age calculation" }).click();
  await expect(page.locator("#calculation-trace .result-value")).toHaveText("64");
  await expect(page.locator("#calculation-trace .result-units")).toHaveText(
    "completed years",
  );
  await expect(page.locator("#calculation-trace .warning-block")).toContainText(
    "Date of birth has no evidence link; it is a reviewer-entered value.",
  );
  await expect(page.locator("#calculation-history")).toContainText("64");
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 8 — the refusal is visible and leaves no run behind.
  section = await expectStep(
    page,
    8,
    "Confirm a calculation refuses",
    "Step 8 of 12 · 7 passed",
  );
  const runsBefore = await page
    .locator("#calculation-history .run-list li")
    .count();
  await page.getByLabel("EPRD date of birth").fill("1960-06-15");
  await page.getByLabel("EPRD Earliest Annuity Date").fill("2015-06-15");
  await page
    .getByLabel("EPRD date of plan termination (DOPT)")
    .fill("2001-12-31");
  await page.getByRole("button", { name: "Run EPRD calculation" }).click();
  await expect(page.locator(".error-banner")).toContainText(
    "EPRD age-55 rule applies to plans with a DOPT on or after 2002-06-01",
  );
  await expect(page.locator("#eprd-input .result-hero")).toHaveCount(0);
  await expect(page.locator("#calculation-history .run-list li")).toHaveCount(
    runsBefore,
  );
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 9 — every readiness line states its status and what is missing.
  section = await expectStep(
    page,
    9,
    "Read the readiness checklist",
    "Step 9 of 12",
  );
  await expect(
    page.getByRole("heading", { name: "Readiness for a work product" }),
  ).toBeVisible();
  await expect(page.locator("#reconciliation .checklist-row")).toHaveCount(8);
  await expect(page.locator("#census-reconciliation")).toContainText(
    "No reviewer-recorded census control total",
  );
  await expect(page.locator("#census-reconciliation")).toContainText("Blocked");
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 10 — the review copy is generated from a frozen snapshot.
  section = await expectStep(
    page,
    10,
    "Generate the review copy",
    "Step 10 of 12",
  );
  const producer = page.locator("#work-product-generate");
  await expect(
    producer.getByRole("button", { name: "Generate review copy" }),
  ).toBeEnabled();
  await producer.getByRole("button", { name: "Generate review copy" }).click();
  await expect(producer).toContainText("plan-summary-review-copy.html");
  await expect(producer.getByText(/^[0-9a-f]{64}$/).first()).toBeVisible();
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 11 — the copy opens as a tab, and only as a tab.
  section = await expectStep(page, 11, "Open the review copy", "Step 11 of 12");
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  const popupPromise = page.waitForEvent("popup");
  await producer.getByRole("button", { name: "Open in new tab" }).click();
  const popup = await popupPromise;
  await expect(
    popup.getByRole("heading", { name: "Plan summary review copy" }),
  ).toBeVisible();
  await expect(popup.locator("body")).toContainText("CW-DEMO-0001");
  await expect(popup.locator("body")).toContainText("Snapshot SHA-256");
  expect(downloads).toEqual([]);
  await popup.close();
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await section.getByRole("button", { name: "Next step" }).click();

  // Step 12 — filtering the trail is a view, not a deletion.
  section = await expectStep(page, 12, "Filter the audit trail", "Step 12 of 12");
  await page.getByLabel("Event type").selectOption("calculation-run");
  const filteredRows = page.locator(".audit-table tbody tr");
  await expect(filteredRows.first()).toBeVisible();
  const filteredCount = await filteredRows.count();
  expect(filteredCount).toBeGreaterThan(0);
  expect(
    new Set(await page.locator(".audit-table .event-type").allTextContents()),
  ).toEqual(new Set(["calculation-run"]));
  await expect(page.locator(".result-count")).toContainText(
    `Showing ${filteredCount} of`,
  );
  await expect(page.locator(".result-count")).toContainText(
    "Filtering changes this view only",
  );
  await section.getByRole("button", { name: "Pass", exact: true }).click();
  await expect(
    section.getByText("All 12 steps have a result.", { exact: false }),
  ).toBeVisible();

  // Notes carry the recorded outcomes, named for their script, and no evidence.
  const downloadPromise = page.waitForEvent("download");
  await section.getByRole("button", { name: "Download test notes" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^advanced-test-notes-\d{4}-\d{2}-\d{2}\.txt$/,
  );
  const path = await download.path();
  expect(path).not.toBeNull();
  const notes = await readFile(path!, "utf8");
  expect(notes).toContain("PBGC Case Workbench — advanced test notes");
  expect(notes).toMatch(/^Build: \d{4}-\d{2}-\d{2}$/m);
  expect(notes).toContain("Case: CW-DEMO-0001");
  expect(notes).toContain("3. Verify the stored evidence — PASS");
  expect(notes).toContain("8. Confirm a calculation refuses — PASS");
  expect(notes).toContain("12. Filter the audit trail — PASS");
  expect(notes).toContain(
    "Summary: 12 passed, 0 failed, 0 not recorded of 12.",
  );
  expect(notes).not.toContain("Synthetic Retiree Plan");
  expect(notes).not.toContain("synthetic-plan-document.pdf");

  expect(consoleErrors).toEqual([]);
});

test("holds one test record at a time", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start the 15-minute test" }).click();

  const advancedButton = page.getByRole("button", {
    name: "Start the 30-minute advanced test",
  });
  await expect(advancedButton).toBeDisabled();
  await expect(advancedButton).toHaveAttribute(
    "title",
    /Prototype test is in progress/,
  );

  await page.getByRole("button", { name: "Exit test" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(advancedButton).toBeEnabled();
});
