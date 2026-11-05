/**
 * End-to-end checks in a real Chromium against the production build.
 *
 * These cover what unit tests cannot: IndexedDB persistence across reloads, a
 * hash computed in the browser, downloads, and the browser's own validation of
 * the branded shell.
 */

import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

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
  await expect(page.getByText(/reviewer-entered value/)).toBeVisible();
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

  await openStage(page, /Reconciliation/);
  await expect(page.getByRole("heading", { name: "Readiness for a work product" })).toBeVisible();
  await expect(page.locator(".checklist-row")).toHaveCount(5);

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

test("is usable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create new case" })).toBeVisible();
  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(page.getByRole("heading", { name: "Plan-level fields" })).toBeVisible();
  await shot(page, "mobile-plan");
});
