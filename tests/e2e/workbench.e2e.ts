/**
 * End-to-end checks in a real Chromium against the production build.
 *
 * These cover what unit tests cannot: IndexedDB persistence across reloads, a
 * hash computed in the browser, downloads, and the browser's own validation of
 * the branded shell.
 */

import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  createSyntheticDocx,
  createSyntheticPdf,
} from "../../src/app/syntheticDocuments";

const SCREENSHOTS = "artifacts/screenshots";

async function openStage(page: Page, name: RegExp): Promise<void> {
  const button = page.getByRole("button", { name });
  if (!(await button.isVisible())) {
    await page.locator("summary", { hasText: "Review details" }).click();
  }
  await button.click();
}

/** Viewport screenshot from the top of the stage, for documentation. */
async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SCREENSHOTS}/${name}.png` });
}

test("completes the plan-field slice end to end", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");

  // Branded shell, honest first state.
  await expect(page.getByRole("heading", { name: "Case workbench" })).toBeVisible();
  await expect(page.getByRole("img", { name: "PBGC" })).toBeVisible();
  await expect(page.getByText("Create or open a case to begin")).toBeVisible();
  await expect(page.getByRole("button", { name: /Plan & people/ })).toBeEnabled();

  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(page.getByRole("heading", { name: "Plan-level fields" })).toBeVisible();
  await expect(page.locator(".stage[aria-current='step']")).toHaveText(/Plan & people/);

  // Empty submit reports every required field, per field.
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByRole("alert")).toHaveCount(4);
  await expect(page.getByLabel("Case Identification Number")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  // A non-alphanumeric case id is rejected with the rule, not a generic error.
  await page.getByLabel("Case Identification Number").fill("CASE-001");
  await page.getByLabel("Case Number of Customer Plan").fill("1001");
  await page.getByLabel("Date of Plan Termination for Customer Plan").fill("2024-06-30");
  await page.getByLabel("Plan Name of Customer Plan").fill("Synthetic Office Test Plan");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("must be alphanumeric")).toBeVisible();

  await page.getByLabel("Case Identification Number").fill("CASE0001");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();
  await expect(page.getByText("Reviewed", { exact: true })).toHaveCount(4);
  await shot(page, "plan-summary");

  // Values survive a reload, and the reload does not create audit noise.
  await page.reload();
  await expect(page.getByLabel("Plan Name of Customer Plan")).toHaveValue(
    "Synthetic Office Test Plan",
  );
  await expect(page.getByLabel("Date of Plan Termination for Customer Plan")).toHaveValue(
    "2024-06-30",
  );

  // Evidence: classify, import, hash, and link.
  await openStage(page, /Documents/);
  await page
    .getByLabel("Document type for new files")
    .selectOption("plan-documents");
  await page
    .getByLabel("Choose evidence files to import")
    .setInputFiles({
      name: "synthetic-plan-summary.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic plan summary for the office test.\n"),
    });
  await expect(page.locator(".artifact-name")).toHaveText("synthetic-plan-summary.txt");
  await expect(page.locator(".artifact-card")).toContainText("Plan document set");
  await expect(page.getByText("1 of 18 classes added")).toBeVisible();
  const documentSet = page.locator("#document-set");
  await expect(
    documentSet.getByRole("heading", { name: "Image Viewer plan documents" }),
  ).toBeVisible();
  await expect(
    documentSet.getByRole("heading", { name: "PBGC plan record" }),
  ).toBeVisible();
  await expect(
    documentSet.getByRole("heading", { name: "Participant data" }),
  ).toBeVisible();
  await expect(
    documentSet.getByText("PIP (Pension Information Profile)", { exact: true }),
  ).toBeVisible();
  await expect(documentSet.getByText("Salary data", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Document type for new files").locator("option"),
  ).toHaveCount(19);
  await expect(page.getByText(/SHA-256 [0-9a-f]{20}/)).toBeVisible();
  await expect(page.getByText("Not linked")).toBeVisible();

  // The stored copy is handed back from the case itself, with no server.
  const storedCopyPromise = page.waitForEvent("download");
  await page
    .locator(".artifact-card", { hasText: "synthetic-plan-summary.txt" })
    .getByRole("button", { name: "Download stored copy" })
    .click();
  const storedCopy = await storedCopyPromise;
  expect(storedCopy.suggestedFilename()).toBe("synthetic-plan-summary.txt");
  const storedCopyPath = await storedCopy.path();
  expect(storedCopyPath).not.toBeNull();
  expect(await readFile(storedCopyPath!, "utf8")).toBe(
    "Synthetic plan summary for the office test.\n",
  );

  // Applicability is a reviewer decision, separate from the file count.
  const planDocumentClass = documentSet.locator(
    '[data-class-id="plan-documents"]',
  );
  await planDocumentClass.locator("summary").click();
  await planDocumentClass
    .getByLabel("Applicability for Plan document set")
    .selectOption("applies");
  await planDocumentClass
    .getByLabel("Basis for this decision")
    .fill("Synthetic plan document set is the governing plan record for this test.");
  await planDocumentClass
    .getByRole("button", { name: "Record decision" })
    .click();
  await expect(page.getByText("Reviewer decision recorded and audited.")).toBeVisible();
  await expect(page.getByText("1 of 18 applicability reviewed")).toBeVisible();
  await expect(planDocumentClass).toContainText("Ready for review");
  await expect(planDocumentClass).toContainText("1 file");

  const qdrosClass = documentSet.locator('[data-class-id="qdros"]');
  await qdrosClass.locator("summary").click();
  await qdrosClass
    .getByLabel("Applicability for QDROs")
    .selectOption("does-not-apply");
  await qdrosClass
    .getByLabel("Basis for this decision")
    .fill("Synthetic case record contains no QDRO for this test.");
  await qdrosClass.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("2 of 18 applicability reviewed")).toBeVisible();
  await expect(qdrosClass).toContainText("Not applicable");
  await expect(documentSet.locator(".document-class-summary")).toContainText(
    "2 of 18 classes have a recorded applicability decision",
  );
  await expect(page.getByText("1 of 18 classes added")).toBeVisible();

  await page.getByLabel("Supports field").selectOption({ label: "Plan Name of Customer Plan" });
  await page.getByRole("button", { name: "Link evidence" }).click();
  await expect(page.getByText("Linked to 1 field")).toBeVisible();
  await shot(page, "evidence");

  // Duplicate import is refused by content hash.
  await page
    .getByLabel("Choose evidence files to import")
    .setInputFiles({
      name: "renamed-copy.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic plan summary for the office test.\n"),
    });
  await expect(page.getByText(/already imported \(identical SHA-256\)/)).toBeVisible();

  // Population: import participant records, see the age, keep benefits blocked.
  await openStage(page, /Plan & people/);
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByLabel("Choose participant CSV to import").setInputFiles({
    name: "synthetic-participants.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "participant_key,record_type,status,date_of_birth,date_of_hire,date_of_termination,date_of_death\n" +
        "P-0001,participant,retired,1950-01-15,1975-01-15,2010-12-31,\n" +
        "P-0002,participant,separated-vested,1960-01-15,1985-01-15,,\n",
    ),
  });
  await expect(page.getByText(/Imported 2 participant records/)).toBeVisible();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".data-table tbody tr").first()).toContainText("74");
  await expect(page.locator(".data-table tbody tr").nth(1)).toContainText("64");
  await expect(page.getByText("Blocked").first()).toBeVisible();
  const registerDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download participant register" }).click();
  expect((await registerDownload).suggestedFilename()).toMatch(/participant-register\.html$/);
  await shot(page, "population");

  // Stored-byte integrity: the import hash is re-checked as an explicit action.
  await openStage(page, /Documents/);
  const censusCard = page.locator(".artifact-card", {
    hasText: "synthetic-participants.csv",
  });
  await expect(censusCard).toContainText("Integrity: not checked");
  await page.getByRole("button", { name: "Verify active evidence" }).click();
  await expect(page.getByText("Verified 2 stored evidence files")).toBeVisible();
  await expect(censusCard).toContainText("Integrity: Verified");
  await expect(page.locator(".artifact-card")).toHaveCount(2);

  // Final document: plan data is inserted, questions can be answered, and the
  // answer travels into the downloaded Word file.
  await openStage(page, /Final document/);
  await expect(page.getByRole("heading", { name: "Your plan summary" })).toBeVisible();
  await expect(page.locator(".doc-paper")).toContainText("Synthetic Office Test Plan");
  await expect(page.locator(".doc-paper")).toContainText("1001");
  await expect(page.locator(".doc-paper")).toContainText("2024-06-30");
  await expect(page.getByText("Census imported")).toBeVisible();

  await page.getByRole("button", { name: /^Plan provisions/ }).click();
  await expect(page.getByRole("heading", { name: "Plan provisions" })).toBeVisible();
  await page
    .locator('#plan-provisions details[data-section="Plan Provisions"] summary')
    .click();
  const adoption = page.locator('[data-decision-key="r5.decision.item-01"]');
  await adoption.getByRole("button", { name: "Answer" }).click();
  await adoption.getByLabel("What the plan says").fill("January 1, 2005");
  await adoption
    .getByLabel("Evidence file")
    .selectOption({ label: "synthetic-plan-summary.txt" });
  await adoption.getByLabel("Page").fill("1");
  await adoption.getByLabel("Section").fill("Article 1");
  await adoption
    .getByLabel("Where this comes from")
    .fill("Synthetic plan document, Article 1");
  await adoption.getByRole("button", { name: "Save answer" }).click();
  await expect(adoption).toContainText("January 1, 2005");
  await expect(adoption).toContainText(
    "File: synthetic-plan-summary.txt · page 1 · Article 1",
  );
  await expect(
    page.getByText("Reviewer decision recorded and audited."),
  ).toBeVisible();
  await expect(page.getByText(/1 of 71 answered/).first()).toBeVisible();
  await shot(page, "plan-provisions");

  await page.getByRole("button", { name: "Document", exact: true }).click();
  await expect(page.getByText("Draft · 4 of 81 items filled")).toBeVisible();
  await expect(
    page.locator(".doc-paper-list li", { hasText: "Plan Provisions" }),
  ).toContainText("1 of 3");

  const documentDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download plan summary (Word)" }).click();
  const documentFile = await documentDownload;
  expect(documentFile.suggestedFilename()).toMatch(/plan-summary-draft\.docx$/);
  const docxPath = await documentFile.path();
  const docxBytes = await readFile(docxPath!);
  expect(docxBytes.includes(Buffer.from("January 1, 2005"))).toBe(true);
  await expect(page.getByText("Downloaded.")).toBeVisible();
  await shot(page, "final-document");

  // Rules: the blocked provisions are visible and labelled.
  await openStage(page, /Rules & assumptions/);
  await expect(page.getByRole("heading", { name: "Earliest PBGC retirement date" })).toBeVisible();
  await expect(page.getByText("Blocked:").first()).toBeVisible();
  await expect(page.getByText("Unresolved").first()).toBeVisible();
  await shot(page, "rules");

  // Calculations: a real, exact result with a trace.
  await openStage(page, /Calculations/);
  await page.getByLabel("Participant date of birth").fill("1950-01-15");
  await page.getByLabel("As-of date").fill("2024-06-30");
  await page.getByRole("button", { name: "Run age calculation" }).click();
  await expect(page.locator(".result-value")).toHaveText("74");
  await expect(page.getByText(/completed years/i).first()).toBeVisible();
  await expect(page.getByText(/reviewer-entered value/).first()).toBeVisible();
  await shot(page, "calculation");

  // EPRD: the cited age-55 floor runs and flags the reviewer determination.
  await page.getByLabel("EPRD date of birth").fill("1950-01-15");
  await page.getByLabel("EPRD Earliest Annuity Date").fill("2000-01-01");
  await page.getByLabel("EPRD date of plan termination (DOPT)").fill("2024-06-30");
  await page.getByRole("button", { name: "Run EPRD calculation" }).click();
  await expect(page.locator("#eprd-input .result-value")).toHaveText("2005-01-15");
  await expect(page.getByText(/PBGC determination could move this date/)).toBeVisible();
  await expect(page.getByText("pbgc:earliest-retirement-date").first()).toBeVisible();

  // Aggregate limit: the guidance's Example 1 arithmetic, with the guarantee
  // amount as a required input rather than a table lookup.
  await page.getByLabel("Current plan identifier").fill("Plan XYZ");
  await page.getByLabel("Current plan DOPT").fill("2001-04-05");
  await page.getByLabel("Current plan guaranteed benefit (monthly)").fill("2500");
  await page.getByLabel("Current plan funded by plan assets (monthly)").fill("264");
  await page.getByLabel("Current plan funded by recovery (monthly)").fill("110.46");
  await page.getByLabel("Maximum guaranteeable benefit (monthly)").fill("3035.88");
  await page.getByLabel("Guarantee determination date").fill("2001-04-05");
  await page
    .getByLabel("Guarantee basis (table year, age, annuity form)")
    .fill("2001 table, age 62, straight life annuity");
  await page.getByLabel("Prior plan 1 identifier").fill("Plan ABC");
  await page.getByLabel("Prior plan 1 DOPT").fill("1997-06-16");
  await page
    .getByLabel("Prior plan 1 benefit payable from PBGC funds (monthly)")
    .fill("1269.27");
  await page.getByRole("button", { name: "Run aggregate limit calculation" }).click();
  await expect(page.locator("#aggregate-input .result-value")).toHaveText("1766.61");
  await expect(page.getByText(/Appendix D/).first()).toBeVisible();

  // BCV add-in: a documented example runs with its page citation and rule.
  await page.getByLabel("BCV function").selectOption("ANB");
  await page.getByLabel("Add-in date of birth").fill("1935-09-01");
  await page.getByLabel("Add-in thru date").fill("1989-04-01");
  await page.getByRole("button", { name: "Run add-in calculation" }).click();
  await expect(page.locator(".addin-result-value")).toHaveText("54");
  await expect(page.getByText(/bcv:anb/).first()).toBeVisible();
  await shot(page, "addin");

  // Traces are durable: a reload keeps every run with its kind and value.
  await page.reload();
  await openStage(page, /Calculations/);
  const runHistory = page.locator("#calculation-history");
  await expect(runHistory).toContainText("4 runs stored");
  await expect(runHistory).toContainText("Age at a date");
  await expect(runHistory).toContainText("Earliest PBGC Retirement Date");
  await expect(runHistory).toContainText("Aggregate limit");
  await expect(runHistory).toContainText("BCV add-in");

  await openStage(page, /Reconciliation/);
  await expect(page.getByRole("heading", { name: "Readiness for a work product" })).toBeVisible();
  await expect(page.locator("#reconciliation .checklist-row")).toHaveCount(8);
  await expect(
    page.locator("#reconciliation .checklist-row", {
      hasText: "Stored evidence matches recorded hashes",
    }),
  ).toContainText("Pass");

  // Census control total: a mismatch is blocking, and a corrected control passes.
  const censusPanel = page.locator("#census-reconciliation");
  await expect(censusPanel).toContainText("Imported rows: 2");
  const countMatch = censusPanel.locator(".checklist-row", {
    hasText: "Imported row count matches the control",
  });
  await censusPanel.getByLabel("Expected census row count").fill("3");
  await censusPanel
    .getByLabel("Source and basis for the control total")
    .fill("Synthetic plan sponsor census count supplied for this test.");
  await censusPanel.getByRole("button", { name: "Record control total" }).click();
  await expect(countMatch).toContainText("Blocking");
  await expect(countMatch).toContainText("difference -1");

  await censusPanel.getByLabel("Expected census row count").fill("2");
  await censusPanel
    .getByLabel("Source and basis for the control total")
    .fill("Corrected synthetic control after reconciling the two imported rows.");
  await censusPanel.getByRole("button", { name: "Record control total" }).click();
  await expect(countMatch).toContainText("Pass");
  await expect(censusPanel).toContainText("control: 2");

  // A revised census supersedes the earlier import without deleting it: the
  // register counts only the authoritative rows and the history keeps both.
  await openStage(page, /Plan & people/);
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByLabel("Choose participant CSV to import").setInputFiles({
    name: "synthetic-participants-revised.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "participant_key,record_type,status,date_of_birth,date_of_hire,date_of_termination,date_of_death\n" +
        "P-0001,participant,retired,1950-01-15,1975-01-15,2011-06-30,\n" +
        "P-0002,participant,separated-vested,1960-01-15,1985-01-15,,\n",
    ),
  });
  await expect(page.getByText(/This import supersedes/)).toBeVisible();
  await expect(
    page.locator("#population-import .data-table tbody tr"),
  ).toHaveCount(2);
  const importHistory = page.locator("#population-imports");
  await expect(importHistory.locator("tbody tr")).toHaveCount(2);
  await expect(importHistory).toContainText("synthetic-participants-revised.csv");
  await expect(importHistory).toContainText("synthetic-participants.csv");
  await expect(importHistory.getByText("Authoritative", { exact: true })).toBeVisible();
  await expect(importHistory.getByText("Superseded", { exact: true })).toBeVisible();

  const revision = page.locator("#population-changes");
  await expect(revision).toContainText("1 changed · 0 added · 0 removed");
  await expect(revision).toContainText("P-0001");
  await expect(revision).toContainText("Date of termination");
  await expect(revision).toContainText("2010-12-31");
  await expect(revision).toContainText("2011-06-30");

  await openStage(page, /Reconciliation/);
  await expect(censusPanel).toContainText("Imported rows: 2");
  await expect(censusPanel).toContainText(
    "Authoritative census: synthetic-participants-revised.csv",
  );
  await expect(censusPanel).toContainText(
    "2 rows from 1 earlier import remain stored and exported",
  );
  await expect(censusPanel).toContainText("1 changed, 0 added, 0 removed");
  await expect(censusPanel).toContainText("supersedes");
  await expect(censusPanel).toContainText(
    "The control total predates this census import",
  );
  await expect(countMatch).toContainText("Pass");

  await openStage(page, /Work products/);

  // Required classes are opt-in. A recorded policy gates the review copy, and a
  // superseding policy can correct it without erasing the first decision.
  const reviewCopyPolicy = page.locator(
    '[data-policy-spec="wp.plan-summary-review-copy"]',
  );
  await reviewCopyPolicy.locator("summary").click();
  await reviewCopyPolicy
    .getByRole("checkbox", { name: /Census at termination/ })
    .check();
  await reviewCopyPolicy
    .getByLabel("Basis for required classes")
    .fill("Synthetic policy test: census is required for this review copy.");
  await reviewCopyPolicy
    .getByRole("button", { name: "Record class policy" })
    .click();
  await expect(page.getByText("Reviewer decision recorded and audited.")).toBeVisible();
  await expect(reviewCopyPolicy).toContainText("Requires Census at termination");

  const reviewCopyPanel = page.locator("#work-product-generate");
  const classPolicyCheck = reviewCopyPanel.locator(".checklist-row", {
    hasText: "Required plan-data classes are applicable and present",
  });
  await expect(classPolicyCheck).toContainText("Blocking");
  await expect(classPolicyCheck).toContainText("Census at termination");
  await expect(page.getByRole("button", { name: "Generate review copy" })).toBeDisabled();
  await reviewCopyPolicy.locator("summary").click();
  await reviewCopyPolicy.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${SCREENSHOTS}/work-product-class-policy.png`,
  });

  await reviewCopyPolicy
    .getByRole("checkbox", { name: /Census at termination/ })
    .uncheck();
  await reviewCopyPolicy
    .getByRole("checkbox", { name: /Plan document set/ })
    .check();
  await reviewCopyPolicy
    .getByLabel("Basis for required classes")
    .fill("Synthetic policy test: the plan document set is the required class.");
  await reviewCopyPolicy
    .getByRole("button", { name: "Record class policy" })
    .click();
  await expect(reviewCopyPolicy).toContainText("Requires Plan document set");
  await expect(classPolicyCheck).toContainText("Pass");
  await expect(page.getByRole("button", { name: "Generate review copy" })).toBeEnabled();

  await page.getByRole("button", { name: "Generate review copy" }).click();
  await expect(page.getByText(/^[0-9a-f]{64}$/).first()).toBeVisible();
  await expect(page.getByText(/plan-summary-review-copy\.html/).first()).toBeVisible();

  // Review: export downloads a bundle.
  await openStage(page, /Review & export/);
  const auditRows = await page.locator(".audit-table tbody tr").count();
  expect(auditRows).toBeGreaterThanOrEqual(8);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review bundle" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/CW-0001-review-bundle-.*\.json$/);
  await expect(page.getByText(/Exported CW-0001-review-bundle/)).toBeVisible();
  await shot(page, "review");

  // Reload must not append audit events (the first-slice regression).
  await page.reload();
  await openStage(page, /Review & export/);
  await expect(page.locator(".audit-table tbody tr")).toHaveCount(auditRows + 1);

  // Close returns to the case list without deleting anything.
  await openStage(page, /Case$/);
  await page.getByRole("button", { name: /Close CW-0001/ }).click();
  await expect(page.getByText("Create or open a case to begin")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cases on this workstation" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("imports a repository snapshot, confirms a fact, and keeps the R5 notice blocked", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const requests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();

  const snapshot = {
    repositoryId: "synthetic-plan-repository",
    schemaVersion: "1.0.0",
    snapshotId: "snapshot-e2e-001",
    capturedAt: "2026-11-05T12:00:00.000Z",
    synthetic: true,
    records: [
      {
        recordId: "profile-e2e-001",
        recordType: "plan-profile",
        locator: "synthetic://plan-profile/E2E",
        values: {
          planName: "Synthetic Repository Mapping Plan",
          caseNumber: 3001,
          dopt: "2024-06-30",
        },
      },
    ],
  };

  await page
    .getByLabel("Repository snapshot (synthetic JSON)")
    .setInputFiles({
      name: "synthetic-plan-data-repository.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(snapshot, null, 2)),
    });
  await expect(page.getByText(/Imported repository snapshot/)).toBeVisible();
  await expect(page.getByText("0 of 3 confirmed")).toBeVisible();
  await expect(page.locator(".mapping-table tbody tr")).toHaveCount(3);
  await expect(page.getByText("Candidate", { exact: true })).toHaveCount(3);

  await page
    .getByRole("button", { name: "Confirm repository Plan Name of Customer Plan" })
    .click();
  await expect(page.getByText("Repository value confirmed and audited.")).toBeVisible();
  await expect(page.getByText("1 of 3 confirmed")).toBeVisible();
  await expect(page.getByLabel("Plan Name of Customer Plan")).toHaveValue(
    "Synthetic Repository Mapping Plan",
  );
  await shot(page, "plan-data-mapping");

  await page.reload();
  await expect(page.getByText("1 of 3 confirmed")).toBeVisible();
  await expect(page.getByLabel("Plan Name of Customer Plan")).toHaveValue(
    "Synthetic Repository Mapping Plan",
  );

  await openStage(page, /Work products/);
  const mappingCoverage = page.locator('ul[aria-label="R5 mapping coverage"]');
  await expect(mappingCoverage).toContainText(
    "3 of 3 R5 fact cells have a repository binding",
  );
  await expect(mappingCoverage).toContainText("Confirmed 1");
  await expect(mappingCoverage).toContainText(
    "71 reviewer-decision cells remain manual",
  );
  await expect(mappingCoverage).toContainText(
    "7 calculation or blocked cells remain blocked",
  );
  await expect(page.getByText(/80 placeholders are unresolved/)).toBeVisible();
  await expect(
    page.locator(".coverage-table tr", { hasText: "Plan Name:" }),
  ).toContainText("Confirmed source");

  await openStage(page, /Plan & people/);
  await page
    .getByRole("button", {
      name: "Enter a correction for Date of Plan Termination for Customer Plan",
    })
    .click();
  await page
    .getByLabel("Corrected value for Date of Plan Termination for Customer Plan")
    .fill("2024-07-01");
  await page
    .getByLabel("Basis for correcting Date of Plan Termination for Customer Plan")
    .fill("Synthetic correction: the reviewer verified a different termination date.");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Repository value confirmed and audited.")).toBeVisible();
  await expect(
    page.getByText(/Reviewer correction basis: Synthetic correction/),
  ).toBeVisible();
  await expect(page.locator("#field-cust-dopt")).toHaveValue("2024-07-01");
  // A reviewer-corrected value is a fact, but the source candidate remains
  // stale until it matches that fact; it is not silently counted as confirmed.
  await expect(page.getByText("1 of 3 confirmed")).toBeVisible();
  await expect(
    page.locator(".mapping-table tbody tr", { hasText: "Dopt" }),
  ).toContainText("Review again");

  await page.reload();
  await expect(
    page.getByText(/Reviewer correction basis: Synthetic correction/),
  ).toBeVisible();
  await expect(page.getByText("1 of 3 confirmed")).toBeVisible();

  expect(consoleErrors).toEqual([]);
  const appOrigin = new URL(page.url()).origin;
  const external = requests.filter((url) => {
    if (!url.startsWith("http")) return false;
    return new URL(url).origin !== appOrigin;
  });
  expect(external).toEqual([]);
});

test("restores a bundle into a new case without overwriting the open one", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();
  await page.getByLabel("Case Identification Number").fill("CASE0002");
  await page.getByLabel("Case Number of Customer Plan").fill("2002");
  await page.getByLabel("Date of Plan Termination for Customer Plan").fill("2025-01-31");
  await page.getByLabel("Plan Name of Customer Plan").fill("Synthetic Restore Target Plan");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();

  await openStage(page, /Review & export/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review bundle" }).click();
  const download = await downloadPromise;
  const bundlePath = await download.path();
  expect(bundlePath).toBeTruthy();

  await page.getByLabel("Choose a case bundle to restore").setInputFiles(bundlePath!);
  await expect(page.getByText(/Restored CW-0002 from/)).toBeVisible();

  // The restore is a new case with a new alias, and the facts came with it.
  await expect(page.getByText("Active case")).toBeVisible();
  await openStage(page, /Case$/);
  await expect(page.locator(".case-list-item")).toHaveCount(2);
  await expect(page.locator(".case-list-item", { hasText: "CW-0002" })).toBeVisible();
});

test("refuses a bundle whose evidence bytes no longer match the recorded hash", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();
  await openStage(page, /Documents/);
  await page.getByLabel("Document type for new files").selectOption("plan-documents");
  await page
    .getByLabel("Choose evidence files to import")
    .setInputFiles({
      name: "synthetic-integrity-bundle.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic evidence for the payload verification test.\n"),
    });
  await expect(page.locator(".artifact-name")).toHaveText(
    "synthetic-integrity-bundle.txt",
  );

  await openStage(page, /Review & export/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review bundle" }).click();
  const download = await downloadPromise;
  const bundlePath = await download.path();
  expect(bundlePath).toBeTruthy();

  // Restamp the manifest so it matches the file. The manifest then passes, but
  // the artifact's recorded SHA-256 no longer describes the bundled bytes.
  const bundle = JSON.parse(await readFile(bundlePath!, "utf8"));
  bundle.artifacts[0].artifact.sha256 = "a".repeat(64);
  const artifactsEntry = bundle.manifest.find(
    (entry: { part: string }) => entry.part === "artifacts",
  );
  artifactsEntry.sha256 = createHash("sha256")
    .update(JSON.stringify(bundle.artifacts))
    .digest("hex");
  const tamperedPath = join(tmpdir(), `pbgc-tampered-bundle-${Date.now()}.json`);
  await writeFile(tamperedPath, JSON.stringify(bundle, null, 2));

  try {
    await page.getByLabel("Choose a case bundle to restore").setInputFiles(tamperedPath);
    await expect(page.locator(".error-banner")).toContainText(
      /payload verification failed/i,
    );
    await expect(page.locator(".error-banner")).toContainText(
      /recorded SHA-256/i,
    );
    await expect(page.locator(".error-banner")).toContainText(
      /No case data was restored/i,
    );
  } finally {
    await unlink(tamperedPath).catch(() => undefined);
  }

  // The refusal wrote nothing: the original case is still the only one.
  await openStage(page, /Case$/);
  await expect(page.locator(".case-list-item")).toHaveCount(1);
});

test("creates the synthetic R5 demo case without making the notice producible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create 2024 synthetic demo case" }).click();

  await expect(page.getByRole("heading", { name: "Your plan summary" })).toBeVisible();
  await expect(page.getByText(/SYNTHETIC DEMO — NOT A REAL PLAN/)).toBeVisible();
  await expect(page.getByText("Draft · 10 of 81 items filled")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Synthetic demo inputs" })).toBeVisible();
  await expect(page.getByText("2024-10-31")).toBeVisible();
  await expect(page.getByText("5.18% for the first 5 years")).toBeVisible();

  await openStage(page, /Work products/);
  const coverage = page.locator("#work-product-r5-coverage");
  await expect(coverage).toContainText("10 of 81 resolved");
  await expect(coverage).toContainText("7 synthetic demo cell(s) resolved");
  await expect(coverage).toContainText("71 reviewer-decision cells remain manual");
  await expect(coverage).toContainText("The notice is not producible.");
});

test("creates the 2023 synthetic R5 demo case with its own published row", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create 2023 synthetic demo case" }).click();

  await expect(page.getByRole("heading", { name: "Your plan summary" })).toBeVisible();
  await expect(page.getByText(/SYNTHETIC DEMO — NOT A REAL PLAN/)).toBeVisible();
  await expect(page.getByText("Draft · 10 of 81 items filled")).toBeVisible();
  await expect(page.getByText("2023-10-31")).toBeVisible();
  await expect(page.getByText("No benefit freeze recorded")).toBeVisible();
  await expect(page.getByText("7.79% (FY2023)")).toBeVisible();
  await expect(page.getByText("4.91% for the first 5 years")).toBeVisible();
  await expect(
    page.getByText("5.38% for the first 20 years; 5.09% thereafter"),
  ).toBeVisible();

  await openStage(page, /Work products/);
  const coverage = page.locator("#work-product-r5-coverage");
  await expect(coverage).toContainText("10 of 81 resolved");
  await expect(coverage).toContainText("7 synthetic demo cell(s) resolved");
  await expect(coverage).toContainText("71 reviewer-decision cells remain manual");
  await expect(coverage).toContainText("The notice is not producible.");
});

test("retires, reinstates, and discards a stored copy without deleting the record", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();
  await openStage(page, /Documents/);

  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "synthetic-retired.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic document to retire.\n"),
  });
  await expect(page.getByText("1 active document", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^Retire/ }).click();
  await page
    .getByLabel("Reason for retiring this file")
    .fill("Synthetic duplicate upload.");
  await page.getByRole("button", { name: "Retire file" }).click();

  await expect(
    page.getByRole("heading", { name: "Retired evidence" }),
  ).toBeVisible();
  await expect(page.getByText("0 active documents", { exact: true })).toBeVisible();
  await expect(page.getByText("Reason: Synthetic duplicate upload.")).toBeVisible();
  await expect(
    page.getByText(/Retired "synthetic-retired.txt" from active evidence/),
  ).toBeVisible();

  // The retirement survives a reload, and the file is still stored and hashed.
  await page.reload();
  await openStage(page, /Documents/);
  await expect(
    page.getByRole("heading", { name: "Retired evidence" }),
  ).toBeVisible();
  await expect(page.getByText("0 active documents", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Return to active evidence" }).click();
  await expect(page.getByText("1 active document", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Retired evidence" }),
  ).toHaveCount(0);

  // Retention: a second retirement may discard the stored copy, but only with
  // a reason and the exact file name, and the record stays with its hash.
  await page.getByRole("button", { name: /^Retire/ }).click();
  await page
    .getByLabel("Reason for retiring this file")
    .fill("Synthetic retention review.");
  await page.getByRole("button", { name: "Retire file" }).click();
  await page.getByRole("button", { name: /^Discard stored copy/ }).click();
  await page
    .getByLabel("Reason for discarding the stored copy")
    .fill("Synthetic source copy no longer needed.");
  await page
    .getByLabel("Type the file name to confirm")
    .fill("synthetic-retired.txt");
  await page.getByRole("button", { name: "Discard stored copy", exact: true }).click();

  await expect(
    page.getByText(/Discarded the stored copy of "synthetic-retired.txt"/),
  ).toBeVisible();
  await expect(page.getByText("Bytes discarded", { exact: true })).toBeVisible();
  await expect(page.getByText("1 copy discarded", { exact: true })).toBeVisible();
  await expect(page.getByText(/Stored evidence: 0 B/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Return to active evidence" }),
  ).toHaveCount(0);

  // The discard survives a reload and the record still carries its hash.
  await page.reload();
  await openStage(page, /Documents/);
  await expect(page.getByText("Bytes discarded", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/SHA-256 [0-9a-f]{20}/).first(),
  ).toBeVisible();
  await expect(page.getByText(/Stored evidence: 0 B/)).toBeVisible();

  // Reattach is verified against the retained hash: a different file is
  // refused, and the original file restores the bytes without reinstating it.
  const reattachInput = page.getByLabel(
    /Choose the original file to reattach for synthetic-retired.txt/,
  );
  await reattachInput.setInputFiles({
    name: "synthetic-retired.txt",
    mimeType: "text/plain",
    // Same byte length as the original, different content: only the hash can
    // distinguish them, and the record must not change.
    buffer: Buffer.from("Synthetic document to retIre.\n"),
  });
  await expect(page.getByText(/does not hash to the SHA-256/)).toBeVisible();
  await expect(page.getByText("Bytes discarded", { exact: true })).toBeVisible();

  await reattachInput.setInputFiles({
    name: "synthetic-retired.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic document to retire.\n"),
  });
  await expect(
    page.getByText(/Reattached the stored copy of "synthetic-retired.txt"/),
  ).toBeVisible();
  await expect(page.getByText("Bytes discarded", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Stored evidence: 30 B/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Return to active evidence" }),
  ).toBeVisible();

  await openStage(page, /Review & export/);
  const audit = page.locator(".audit-table");
  // Two retirements, one reinstatement, one discard, one reattach.
  await expect(audit.getByText("artifact-retired", { exact: true })).toHaveCount(2);
  await expect(audit.getByText("artifact-reinstated", { exact: true })).toHaveCount(1);
  await expect(
    audit.getByText("artifact-bytes-purged", { exact: true }),
  ).toHaveCount(1);
  await expect(
    audit.getByText("artifact-bytes-reattached", { exact: true }),
  ).toHaveCount(1);

  // The trail can be narrowed for review without changing what the case holds.
  const totalRows = await audit.locator("tbody tr").count();
  await page.getByLabel("Event type").selectOption("artifact-retired");
  await expect(audit.locator("tbody tr")).toHaveCount(2);
  await expect(page.getByText(/Showing 2 of \d+ events/)).toBeVisible();

  await page.getByLabel("Search the trail").fill("reattach");
  await expect(audit.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByText("No audit events match these filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(audit.locator("tbody tr")).toHaveCount(totalRows);

  // Scoping to one file shows its events only, including the retirement that
  // the file list marks as retired.
  await page
    .getByLabel("Evidence file")
    .selectOption({ label: "synthetic-retired.txt (retired)" });
  expect(await audit.locator("tbody tr").count()).toBeGreaterThan(0);
  await expect(audit.getByText("case-created", { exact: true })).toHaveCount(0);
  await expect(
    audit.getByText("artifact-bytes-reattached", { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByText(/· synthetic-retired\.txt/)).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(audit.locator("tbody tr")).toHaveCount(totalRows);
  expect(consoleErrors).toEqual([]);
});

test("reads a stored PDF's text layer and keeps it as observations", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();

  // A citation supports a value the reviewer recorded first.
  await page.getByLabel("Case Identification Number").fill("CASE0002");
  await page.getByLabel("Case Number of Customer Plan").fill("2002");
  await page.getByLabel("Date of Plan Termination for Customer Plan").fill("2024-06-30");
  await page.getByLabel("Plan Name of Customer Plan").fill("Synthetic Cited Plan");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();

  await openStage(page, /Documents/);

  // A generated PDF with a real text layer; no real document is involved.
  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "synthetic-plan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      createSyntheticPdf([
        ["Synthetic plan page one"],
        ["Synthetic page two"],
      ]),
    ),
  });
  await expect(page.getByText("1 active document", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Read text" }).click();
  const panel = page.locator(".extracted-text");
  await expect(panel.getByText("Text observed", { exact: true })).toBeVisible();
  await expect(panel.getByText("Page 1", { exact: true })).toBeVisible();
  await expect(panel.getByText("Synthetic plan page one")).toBeVisible();
  await expect(panel.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(panel.getByText("Synthetic page two")).toBeVisible();
  await expect(panel.getByText(/Observed text, not a case fact/)).toBeVisible();

  // Cite page one for the saved plan name and page two for the case number.
  // Neither value is copied or changed; each field gains a source pointer.
  await panel
    .getByLabel("Cite a passage for")
    .selectOption({ label: "Plan Name of Customer Plan" });
  await panel.getByRole("button", { name: "Cite Page 1" }).click();
  await expect(page.getByText(/The passage is cited for that field/)).toBeVisible();
  await expect(panel.getByText("Cited for Plan Name of Customer Plan")).toBeVisible();
  await expect(panel.getByText(/Observed text, not a case fact/)).toBeVisible();

  await panel
    .getByLabel("Cite a passage for")
    .selectOption({ label: "Case Number of Customer Plan" });
  await panel.getByRole("button", { name: "Cite Page 2" }).click();
  await expect(panel.getByText("Cited for Case Number of Customer Plan")).toBeVisible();

  // Reading the same bytes again keeps both passages' identities, so their
  // citations still resolve instead of being orphaned by new observation ids.
  await page.getByRole("button", { name: "Read text" }).click();
  await expect(page.getByText(/Read 2 text units/)).toBeVisible();
  await expect(panel.getByText("Cited for Plan Name of Customer Plan")).toBeVisible();
  await expect(panel.getByText("Cited for Case Number of Customer Plan")).toBeVisible();

  // The OOXML reader runs in the browser as well, through the same port.
  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "synthetic-notes.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(
      createSyntheticDocx({ paragraphs: ["Synthetic Word paragraph"] }),
    ),
  });
  const docxCard = page
    .locator(".artifact-card")
    .filter({ hasText: "synthetic-notes.docx" });
  await docxCard.getByRole("button", { name: "Read text" }).click();
  await expect(docxCard.getByText("Paragraph 1", { exact: true })).toBeVisible();
  await expect(docxCard.getByText("Synthetic Word paragraph")).toBeVisible();

  // The observations are case records: they survive a reload and are audited
  // once, naming the file and the count rather than the text.
  await page.reload();
  await openStage(page, /Documents/);
  const pdfCard = page
    .locator(".artifact-card")
    .filter({ hasText: "synthetic-plan.pdf" });
  await expect(
    pdfCard.locator(".extracted-text").getByText("Text observed", { exact: true }),
  ).toBeVisible();
  await expect(
    pdfCard.locator(".extracted-text").getByText("Synthetic plan page one"),
  ).toBeVisible();
  await expect(
    pdfCard
      .locator(".extracted-text")
      .getByText("Cited for Plan Name of Customer Plan"),
  ).toBeVisible();
  await expect(
    pdfCard
      .locator(".extracted-text")
      .getByText("Cited for Case Number of Customer Plan"),
  ).toBeVisible();

  await openStage(page, /Reconciliation/);
  await expect(
    page.getByText("Cited passages resolve to stored text", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/2 cited passages resolve to stored text/),
  ).toBeVisible();

  // The reviewed field lists its sources and offers the same retraction
  // without a trip back to Documents.
  await openStage(page, /Plan & people/);
  const planNameRow = page
    .locator(".plan-field")
    .filter({ hasText: "Plan Name of Customer Plan" });
  await planNameRow.getByRole("button", { name: "Review sources" }).click();
  await expect(
    planNameRow.getByText(/synthetic-plan\.pdf · page 1 · cited passage/),
  ).toBeVisible();
  await expect(
    planNameRow.getByRole("button", {
      name: "Retract citation from Plan Name of Customer Plan at page 1",
    }),
  ).toBeVisible();

  // A citation can be withdrawn with a reason. The value, the earlier fact, and
  // the recorded link stay; only the claim that the passage supports the value
  // ends, and the audit trail says why.
  await openStage(page, /Documents/);
  const pdfPanel = pdfCard.locator(".extracted-text");
  await pdfPanel
    .getByRole("button", {
      name: "Retract citation for Plan Name of Customer Plan at Page 1",
    })
    .click();
  const retractForm = pdfPanel.getByRole("form", {
    name: /Retract citation at Page 1/,
  });
  await expect(retractForm).toBeVisible();
  await expect(
    retractForm.getByRole("button", { name: "Confirm retraction" }),
  ).toBeDisabled();
  await retractForm
    .getByLabel("Why is this citation being retracted?")
    .fill("Wrong passage for the plan name.");
  await retractForm.getByRole("button", { name: "Confirm retraction" }).click();
  await expect(page.getByText(/The citation was retracted/)).toBeVisible();
  await expect(
    pdfPanel.getByText("Cited for Plan Name of Customer Plan"),
  ).toHaveCount(0);
  await expect(
    pdfCard.getByText(/Former citation for Plan Name of Customer Plan/),
  ).toBeVisible();

  await openStage(page, /Plan & people/);
  await expect(planNameRow.getByText("No evidence link")).toBeVisible();
  await expect(
    planNameRow.getByRole("button", { name: "Review sources" }),
  ).toHaveCount(0);

  // The second citation is withdrawn from the reviewed field itself: the same
  // service and the same required reason, without a trip back to Documents.
  const caseNumberRow = page
    .locator(".plan-field")
    .filter({ hasText: "Case Number of Customer Plan" });
  await caseNumberRow.getByRole("button", { name: "Review sources" }).click();
  await expect(
    caseNumberRow.getByText(/synthetic-plan\.pdf · page 2 · cited passage/),
  ).toBeVisible();
  await caseNumberRow
    .getByRole("button", {
      name: "Retract citation from Case Number of Customer Plan at page 2",
    })
    .click();
  const caseNumberForm = caseNumberRow.getByRole("group", {
    name: "Retract citation from Case Number of Customer Plan",
  });
  await expect(
    caseNumberForm.getByRole("button", { name: "Confirm retraction" }),
  ).toBeDisabled();
  await caseNumberForm
    .getByLabel("Why is this citation being retracted?")
    .fill("Wrong case-number passage.");
  await caseNumberForm
    .getByRole("button", { name: "Confirm retraction" })
    .click();
  await expect(page.getByText(/The citation was retracted/)).toBeVisible();
  await expect(caseNumberRow.getByText("No evidence link")).toBeVisible();

  // Retracting a field's last citation leaves it reviewer-entered rather than
  // supported by evidence.
  await openStage(page, /Reconciliation/);
  await expect(
    page.getByText(/No reviewed value cites an extracted passage/),
  ).toBeVisible();

  // The retraction is a stored record, not a transient view.
  await page.reload();
  await openStage(page, /Documents/);
  const reloadedPdf = page
    .locator(".artifact-card")
    .filter({ hasText: "synthetic-plan.pdf" });
  await expect(
    reloadedPdf.getByText("Cited for Plan Name of Customer Plan"),
  ).toHaveCount(0);
  await expect(
    reloadedPdf.getByText(/Former citation for Plan Name of Customer Plan/),
  ).toBeVisible();

  await openStage(page, /Review & export/);
  const audit = page.locator(".audit-table");
  await expect(audit.getByText("evidence-linked", { exact: true })).toHaveCount(2);
  await expect(
    audit.getByText("citation-retracted", { exact: true }),
  ).toHaveCount(2);
  await expect(audit.getByText(/Wrong passage for the plan name/)).toBeVisible();
  await expect(audit.getByText(/Wrong case-number passage/)).toBeVisible();
  await expect(
    audit.getByText("evidence-text-extracted", { exact: true }),
  ).toHaveCount(3);
  await expect(audit.getByText(/2 observations$/)).toHaveCount(1);
  await expect(audit.getByText(/2 previously read passages preserved/)).toBeVisible();
  await expect(audit.getByText("Synthetic plan page one")).toHaveCount(0);

  // The retraction is a case record, not a local view: it exports and restores
  // with the retained link, the earlier fact, and its reason.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review bundle" }).click();
  const download = await downloadPromise;
  const bundlePath = await download.path();
  expect(bundlePath).toBeTruthy();
  await page.getByLabel("Choose a case bundle to restore").setInputFiles(bundlePath!);
  await expect(page.getByText(/Restored CW-0002 from/)).toBeVisible();

  await openStage(page, /Documents/);
  const restoredPdf = page
    .locator(".artifact-card")
    .filter({ hasText: "synthetic-plan.pdf" });
  await expect(restoredPdf.getByText("Synthetic plan page one")).toBeVisible();
  await expect(
    restoredPdf.getByText("Cited for Plan Name of Customer Plan"),
  ).toHaveCount(0);
  await expect(
    restoredPdf.getByText(/Former citation for Plan Name of Customer Plan/),
  ).toBeVisible();
  await expect(
    restoredPdf.getByText(/Former citation for Case Number of Customer Plan/),
  ).toBeVisible();

  await openStage(page, /Reconciliation/);
  await expect(
    page.getByText(/No reviewed value cites an extracted passage/),
  ).toBeVisible();

  await openStage(page, /Plan & people/);
  await expect(page.getByLabel("Plan Name of Customer Plan")).toHaveValue(
    "Synthetic Cited Plan",
  );
  await expect(
    page
      .locator(".plan-field")
      .filter({ hasText: "Plan Name of Customer Plan" })
      .getByText("No evidence link"),
  ).toBeVisible();

  await openStage(page, /Review & export/);
  const restoredAudit = page.locator(".audit-table");
  await expect(
    restoredAudit.getByText("citation-retracted", { exact: true }),
  ).toHaveCount(2);
  await expect(
    restoredAudit.getByText(/Wrong passage for the plan name/),
  ).toBeVisible();
  await expect(
    restoredAudit.getByText(/Wrong case-number passage/),
  ).toBeVisible();

  // A withdrawal is not permanent. The retained passage can be cited again:
  // a new link carries the support and the withdrawn one stays in history.
  await openStage(page, /Documents/);
  const citationPanel = restoredPdf.locator(".extracted-text");
  await citationPanel
    .getByLabel("Cite a passage for")
    .selectOption({ label: "Plan Name of Customer Plan" });
  await citationPanel.getByRole("button", { name: "Cite Page 1" }).click();
  await expect(
    page.getByText(/The passage is cited for that field/),
  ).toBeVisible();
  await expect(
    citationPanel.getByText("Cited for Plan Name of Customer Plan"),
  ).toBeVisible();
  await expect(
    restoredPdf.getByText(/Former citation for Plan Name of Customer Plan/),
  ).toBeVisible();
  // The card states the recorded reason for the withdrawal and marks the
  // current citation as a re-citation, so the two entries read as one history.
  await expect(
    restoredPdf.getByText(/withdrawn: Wrong passage for the plan name\./),
  ).toBeVisible();
  await expect(
    restoredPdf.getByText(
      /cited again after an earlier citation of this passage ended/,
    ),
  ).toBeVisible();

  await openStage(page, /Reconciliation/);
  await expect(
    page.getByText(/1 cited passage resolves to stored text/),
  ).toBeVisible();

  await openStage(page, /Review & export/);
  const recitationAudit = page.locator(".audit-table");
  await expect(
    recitationAudit.getByText("evidence-linked", { exact: true }),
  ).toHaveCount(3);
  await expect(
    recitationAudit.getByText("citation-retracted", { exact: true }),
  ).toHaveCount(2);
  await expect(
    recitationAudit.getByText(/Wrong passage for the plan name/),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("is usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create new case" })).toBeVisible();
  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(page.getByRole("heading", { name: "Plan-level fields" })).toBeVisible();
  await shot(page, "mobile-plan");
});
