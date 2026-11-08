/**
 * The office dry run, from the runbook (`docs/real-data-workflow-test.md`),
 * in one case and on synthetic data only.
 *
 * The other browser tests each prove one seam. This one walks the pilot script
 * in the order an analyst will: preflight refusals, citation and transcription,
 * the provision answers, the census workbook, the control total, the review
 * copy, the Word output, the bundle round trip, and the purge. It exists so
 * the runbook cannot drift away from what the artifact actually does.
 */

import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  createSyntheticDocx,
  createSyntheticPdf,
  createSyntheticXlsx,
} from "../../src/app/syntheticDocuments";

const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CENSUS_HEADER =
  "participant_key,record_type,status,date_of_birth,date_of_hire,date_of_termination,date_of_death";
const CENSUS_ROWS = [
  "P-0001,participant,retired,1950-01-15,1975-01-15,2010-12-31,",
  "P-0002,participant,separated-vested,1960-01-15,1985-01-15,,",
  "P-0003,participant,active-vested,1970-03-01,1995-03-01,,",
  "P-0004,beneficiary,retired,1948-07-01,1970-07-01,2008-06-30,",
  "P-0005,participant,not-in-population,1945-11-20,1968-11-20,2012-01-31,",
];

const PASSAGE =
  "Section 3.2(b): Normal retirement age is 65 with 5 years of service.";

async function openStage(page: Page, name: RegExp): Promise<void> {
  const button = page.getByRole("button", { name });
  if (!(await button.isVisible())) {
    await page.locator("summary", { hasText: "Review details" }).click();
  }
  await button.click();
}

test("walks the office runbook end to end on synthetic data", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const consoleErrors: string[] = [];
  const requests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));

  // Step 1 — Create the case.
  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan-level fields" }),
  ).toBeVisible();
  await page.getByLabel("Case Identification Number").fill("CASE0001");
  await page.getByLabel("Case Number of Customer Plan").fill("1001");
  await page
    .getByLabel("Date of Plan Termination for Customer Plan")
    .fill("2024-06-30");
  await page
    .getByLabel("Plan Name of Customer Plan")
    .fill("Synthetic Dry Run Plan");
  await page.getByRole("button", { name: "Save plan fields" }).click();
  await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();

  // Step 2 — Import the plan documents. One readable PDF, one scan with no
  // text layer, one Word amendment. Each is classified before it is stored.
  await openStage(page, /Documents/);
  await page
    .getByLabel("Document type for new files")
    .selectOption("plan-documents");
  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "dry-run-plan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      createSyntheticPdf([
        ["Synthetic Dry Run Plan, restated as of January 1, 2010"],
        ["Section 3.2(b): Normal retirement age is 65 with 5 years of service."],
      ]),
    ),
  });
  await expect(page.getByText("1 active document", { exact: true })).toBeVisible();

  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "dry-run-scanned-plan.pdf",
    mimeType: "application/pdf",
    // A page with no text operators: the app cannot read it, and says so.
    buffer: Buffer.from(createSyntheticPdf([[]])),
  });
  await expect(page.getByText("2 active documents", { exact: true })).toBeVisible();

  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "dry-run-amendment.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(
      createSyntheticDocx({
        paragraphs: ["Amendment 1: the normal retirement age is unchanged."],
      }),
    ),
  });
  await expect(page.getByText("3 active documents", { exact: true })).toBeVisible();

  // The PDF keeps its page locators.
  const planCard = page
    .locator(".artifact-card")
    .filter({ hasText: "dry-run-plan.pdf" });
  await planCard.getByRole("button", { name: "Read text" }).click();
  const planPanel = planCard.locator(".extracted-text");
  await expect(planPanel.getByText("Text available", { exact: true })).toBeVisible();
  await expect(planPanel.getByText("Page 1", { exact: true })).toBeVisible();
  await expect(
    planPanel.getByText(/Synthetic Dry Run Plan/),
  ).toBeVisible();
  await expect(planPanel.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(planPanel.getByText(/Normal retirement age is 65/)).toBeVisible();

  // The DOCX reads as paragraphs.
  const docxCard = page
    .locator(".artifact-card")
    .filter({ hasText: "dry-run-amendment.docx" });
  await docxCard.getByRole("button", { name: "Read text" }).click();
  await expect(docxCard.getByText("Paragraph 1", { exact: true })).toBeVisible();
  await expect(
    docxCard.getByText("Amendment 1: the normal retirement age is unchanged."),
  ).toBeVisible();

  // The scan is refused whole, with no OCR anywhere in the path.
  const scanCard = page
    .locator(".artifact-card")
    .filter({ hasText: "dry-run-scanned-plan.pdf" });
  await scanCard.getByRole("button", { name: "Read text" }).click();
  const scanPanel = scanCard.locator(".extracted-text");
  await expect(scanPanel.locator(".extracted-text-heading .status")).toHaveText(
    "No text read",
  );
  await expect(
    scanPanel.getByText(/holds no text this workbench can read/),
  ).toBeVisible();
  await expect(page.getByText("There is no OCR.")).toBeVisible();

  // Step 2.3 — Type the passage the reviewer needs from the scan.
  const transcription = scanPanel.locator(".transcription-form");
  await transcription.getByLabel("Page", { exact: true }).fill("3");
  await transcription.getByLabel("Passage as it appears on the page").fill(PASSAGE);
  await transcription
    .getByRole("button", { name: "Record transcription" })
    .click();
  await expect(page.locator(".notice-banner")).toContainText(
    "Recorded a reviewer transcription",
  );
  await expect(
    scanPanel.locator(".extracted-text-list .status", {
      hasText: "Reviewer transcription",
    }),
  ).toBeVisible();
  await expect(scanPanel.locator(".extracted-text-locator")).toHaveText("Page 3");
  await expect(scanPanel.getByText(PASSAGE)).toBeVisible();
  await expect(page.getByText(/1 reviewer transcription ·/)).toBeVisible();

  // A duplicate of an imported file is refused by hash, not stored twice.
  await page.getByLabel("Choose evidence files to import").setInputFiles({
    name: "renamed-plan-copy.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      createSyntheticPdf([
        ["Synthetic Dry Run Plan, restated as of January 1, 2010"],
        ["Section 3.2(b): Normal retirement age is 65 with 5 years of service."],
      ]),
    ),
  });
  await expect(page.getByText(/already imported \(identical SHA-256\)/)).toBeVisible();

  // Verify the stored bytes before relying on them.
  await page.getByRole("button", { name: "Verify active evidence" }).click();
  await expect(page.getByText("Verified 3 stored evidence files")).toBeVisible();

  // Applicability is a reviewer decision, not a file count. The plan document
  // set is the class this case actually governs with.
  const documentSet = page.locator("#document-set");
  const planDocumentsClass = documentSet.locator(
    '[data-class-id="plan-documents"]',
  );
  await planDocumentsClass.locator("summary").click();
  await planDocumentsClass
    .getByLabel("Applicability for Plan document set")
    .selectOption("applies");
  await planDocumentsClass
    .getByLabel("Basis for this decision")
    .fill("Dry-run case: the plan document set is the governing plan record.");
  await planDocumentsClass
    .getByRole("button", { name: "Record decision" })
    .click();
  await expect(page.getByText("Reviewer decision recorded and audited.")).toBeVisible();
  await expect(planDocumentsClass).toContainText("Ready for review");

  // Step 3 — Link and cite. The value was recorded first; a citation only
  // records provenance, and the transcription is labelled as the reviewer's.
  await planCard.getByLabel("Supports field").selectOption({
    label: "Plan Name of Customer Plan",
  });
  await planCard.getByRole("button", { name: "Link evidence" }).click();
  await expect(planCard.getByText("Linked to 1 field")).toBeVisible();

  await planPanel
    .getByLabel("Cite a passage for")
    .selectOption({ label: "Plan Name of Customer Plan" });
  await planPanel.getByRole("button", { name: "Cite Page 1" }).click();
  await expect(page.getByText(/The passage is cited for that field/)).toBeVisible();

  await scanPanel
    .getByLabel("Cite a passage for")
    .selectOption({ label: "Plan Name of Customer Plan" });
  await scanPanel.getByRole("button", { name: "Cite Page 3" }).click();
  await expect(page.getByText(/The passage is cited for that field/)).toBeVisible();
  await expect(
    scanPanel.getByText("Cited for Plan Name of Customer Plan"),
  ).toBeVisible();

  // Step 4 — Answer ten provisions across the sections, with a source for each.
  await openStage(page, /Final document/);
  await page.getByRole("button", { name: /^Plan provisions/ }).click();
  await expect(page.getByRole("heading", { name: "Plan provisions" })).toBeVisible();

  const sections = page.locator('#plan-provisions details[data-section]');
  const sectionCount = await sections.count();
  expect(sectionCount).toBeGreaterThan(2);
  for (let index = 0; index < sectionCount; index += 1) {
    const section = sections.nth(index);
    const open = await section.evaluate(
      (element) => (element as HTMLDetailsElement).open,
    );
    if (!open) await section.locator("summary").click();
  }

  const decisionKeys = await page
    .locator("[data-decision-key]")
    .evaluateAll((nodes) =>
      nodes.slice(0, 10).map((node) => node.getAttribute("data-decision-key")!),
    );
  expect(decisionKeys).toHaveLength(10);

  for (const [index, key] of decisionKeys.entries()) {
    const answer = `Synthetic dry-run provision answer ${index + 1}.`;
    const decision = page.locator(`[data-decision-key="${key}"]`);
    await decision.getByRole("button", { name: "Answer" }).click();
    await decision.getByLabel("What the plan says").fill(answer);
    await decision
      .getByLabel("Evidence file")
      .selectOption({ label: "dry-run-plan.pdf" });
    await decision.getByLabel("Page").fill("1");
    await decision
      .getByLabel("Where this comes from")
      .fill("Synthetic dry-run plan document, page 1.");
    await decision.getByRole("button", { name: "Save answer" }).click();
    await expect(decision).toContainText(answer);
  }
  await expect(page.getByText(/10 of 71 answered/).first()).toBeVisible();

  // Step 5 — The census workbook: choose the sheet and header row, confirm the
  // mapping, and keep the workbook as the stored evidence.
  await openStage(page, /Plan & people/);
  await page.getByRole("button", { name: "People", exact: true }).click();
  const censusWorkbook = createSyntheticXlsx({
    sheetName: "Census",
    rows: [
      ["Synthetic dry-run census — no real participants"],
      [],
      [
        "Participant ID",
        "Record",
        "Status",
        "DOB",
        "Hire Date",
        "Termination Date",
      ],
      ["P-0001", "participant", "retired", { date: "1950-01-15" }, { date: "1975-01-15" }, { date: "2010-12-31" }],
      ["P-0002", "participant", "separated-vested", { date: "1960-01-15" }, { date: "1985-01-15" }, null],
      ["P-0003", "participant", "active-vested", { date: "1970-03-01" }, { date: "1995-03-01" }, null],
      ["P-0004", "beneficiary", "retired", { date: "1948-07-01" }, { date: "1970-07-01" }, { date: "2008-06-30" }],
      ["P-0005", "participant", "not-in-population", { date: "1945-11-20" }, { date: "1968-11-20" }, { date: "2012-01-31" }],
    ],
  });
  await page
    .getByLabel("Choose participant CSV or Excel census to import")
    .setInputFiles({
      name: "dry-run-census.xlsx",
      mimeType: XLSX_MEDIA_TYPE,
      buffer: Buffer.from(censusWorkbook),
    });
  await expect(
    page.getByRole("heading", { name: "Map the census columns" }),
  ).toBeVisible();
  await expect(page.getByText(/Worksheet: Census/)).toBeVisible();
  await expect(page.getByLabel("Header row")).toHaveValue("3");
  await expect(page.getByLabel(/^Participant key \(required\)/)).not.toHaveValue("");
  await expect(page.getByLabel(/^Date of termination/)).not.toHaveValue("");

  await page.getByRole("button", { name: "Import mapped census" }).click();
  await expect(page.locator(".notice-banner")).toContainText(
    "Imported 5 participant records from sheet “Census” of dry-run-census.xlsx.",
  );
  await expect(page.getByText(/Authoritative census:/)).toContainText(
    "dry-run-census.xlsx",
  );
  await expect(page.locator("#population-import .data-table tbody tr")).toHaveCount(
    5,
  );
  await expect(page.getByText("Blocked").first()).toBeVisible();

  // Step 5.4 — A control total is a source, not a number the app infers.
  await openStage(page, /Reconciliation/);
  const censusPanel = page.locator("#census-reconciliation");
  await expect(censusPanel).toContainText("Imported rows: 5");
  const countMatch = censusPanel.locator(".checklist-row", {
    hasText: "Imported row count matches the control",
  });
  await censusPanel.getByLabel("Expected census row count").fill("6");
  await censusPanel
    .getByLabel("Source and basis for the control total")
    .fill("Synthetic dry-run control supplied for the pilot.");
  await censusPanel.getByRole("button", { name: "Record control total" }).click();
  await expect(countMatch).toContainText("Blocking");
  await expect(countMatch).toContainText("difference -1");

  await censusPanel.getByLabel("Expected census row count").fill("5");
  await censusPanel
    .getByLabel("Source and basis for the control total")
    .fill("Corrected synthetic control after counting the imported rows.");
  await censusPanel.getByRole("button", { name: "Record control total" }).click();
  await expect(countMatch).toContainText("Pass");
  await expect(censusPanel).toContainText("control: 5");

  // Step 5.5 — A revised census supersedes the first without deleting it.
  await openStage(page, /Plan & people/);
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page
    .getByLabel("Choose participant CSV or Excel census to import")
    .setInputFiles({
      name: "dry-run-census-revised.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          CENSUS_HEADER,
          "P-0001,participant,retired,1950-01-15,1975-01-15,2011-06-30,",
          ...CENSUS_ROWS.slice(1),
        ].join("\n"),
      ),
    });
  await expect(page.getByText(/This import supersedes/)).toBeVisible();
  const importHistory = page.locator("#population-imports");
  await expect(importHistory.locator("tbody tr")).toHaveCount(2);
  await expect(importHistory.getByText("Authoritative", { exact: true })).toBeVisible();
  await expect(importHistory.getByText("Superseded", { exact: true })).toBeVisible();
  const revision = page.locator("#population-changes");
  await expect(revision).toContainText("1 changed · 0 added · 0 removed");
  await expect(revision).toContainText("P-0001");
  await expect(revision).toContainText("2010-12-31");
  await expect(revision).toContainText("2011-06-30");

  await openStage(page, /Reconciliation/);
  await expect(censusPanel).toContainText(
    "The control total predates this census import",
  );
  await expect(censusPanel).toContainText("1 changed, 0 added, 0 removed");

  // Step 6 — Review the case. An age is computed with calendar arithmetic and
  // the EPRD runs only with its cited floor; neither is a benefit amount.
  await openStage(page, /Calculations/);
  await page.getByLabel("Participant date of birth").fill("1950-01-15");
  await page.getByLabel("As-of date").fill("2024-06-30");
  await page.getByRole("button", { name: "Run age calculation" }).click();
  await expect(page.locator(".result-value")).toHaveText("74");

  await page.getByLabel("EPRD date of birth").fill("1950-01-15");
  await page.getByLabel("EPRD Earliest Annuity Date").fill("2000-01-01");
  await page.getByLabel("EPRD date of plan termination (DOPT)").fill("2024-06-30");
  await page.getByRole("button", { name: "Run EPRD calculation" }).click();
  await expect(page.locator("#eprd-input .result-value")).toHaveText("2005-01-15");

  // Required evidence classes are a reviewer policy; the R5 notice must stay
  // blocked even after the review copy is producible.
  await openStage(page, /Work products/);
  const reviewCopyPolicy = page.locator(
    '[data-policy-spec="wp.plan-summary-review-copy"]',
  );
  await reviewCopyPolicy.locator("summary").click();
  await reviewCopyPolicy
    .getByRole("checkbox", { name: /Plan document set/ })
    .check();
  await reviewCopyPolicy
    .getByLabel("Basis for required classes")
    .fill("Dry-run policy: the plan document set is the required class.");
  await reviewCopyPolicy
    .getByRole("button", { name: "Record class policy" })
    .click();
  await expect(reviewCopyPolicy).toContainText("Requires Plan document set");
  await expect(page.getByRole("button", { name: "Generate review copy" })).toBeEnabled();
  await page.getByRole("button", { name: "Generate review copy" }).click();
  await expect(page.getByText(/^[0-9a-f]{64}$/).first()).toBeVisible();
  await expect(page.getByText(/plan-summary-review-copy\.html/).first()).toBeVisible();
  const reviewCopyDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML" }).click();
  const reviewCopy = await reviewCopyDownload;
  expect(reviewCopy.suggestedFilename()).toMatch(
    /CW-0001-plan-summary-review-copy\.html$/,
  );
  const reviewCopyHtml = await readFile((await reviewCopy.path())!, "utf8");
  expect(reviewCopyHtml).toContain("Synthetic Dry Run Plan");
  expect(reviewCopyHtml).toContain("Plan Name");

  const coverage = page.locator("#work-product-r5-coverage");
  await expect(coverage).toContainText("71 reviewer-decision cells remain manual");
  await expect(coverage).toContainText("The notice is not producible.");

  // Step 7 — Outputs. The Word summary carries the answered provisions and
  // marks every unanswered one as not recorded.
  await openStage(page, /Final document/);
  await page.getByRole("button", { name: "Document", exact: true }).click();
  await expect(page.getByText(/Draft · \d+ of 81 items filled/)).toBeVisible();
  const documentDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download plan summary (Word)" }).click();
  const documentFile = await documentDownload;
  expect(documentFile.suggestedFilename()).toMatch(/plan-summary-draft\.docx$/);
  const docx = await readFile((await documentFile.path())!);
  expect(docx.includes(Buffer.from("Synthetic dry-run provision answer 1."))).toBe(
    true,
  );
  expect(docx.includes(Buffer.from("Not recorded"))).toBe(true);

  // Step 8 — Export and restore. The restored case is a new case, not an
  // overwrite, and it carries the transcriptions, citations, census, and audit.
  await openStage(page, /Review & export/);
  const audit = page.locator(".audit-table");
  await expect(
    audit.getByText("evidence-passage-transcribed", { exact: true }),
  ).toBeVisible();
  await expect(audit.getByText("citation-retracted", { exact: true })).toHaveCount(0);

  const bundleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review bundle" }).click();
  const bundle = await bundleDownload;
  expect(bundle.suggestedFilename()).toMatch(/CW-0001-review-bundle-.*\.json$/);
  const bundlePath = await bundle.path();
  expect(bundlePath).toBeTruthy();

  await page.getByLabel("Choose a case bundle to restore").setInputFiles(bundlePath!);
  await expect(page.getByText(/Restored CW-0002 from/)).toBeVisible();

  await openStage(page, /Documents/);
  await expect(page.locator(".artifact-card")).toHaveCount(5);
  const restoredScan = page
    .locator(".artifact-card")
    .filter({ hasText: "dry-run-scanned-plan.pdf" });
  await expect(
    restoredScan.locator(".extracted-text-list .status", {
      hasText: "Reviewer transcription",
    }),
  ).toBeVisible();
  await expect(restoredScan.getByText(PASSAGE)).toBeVisible();
  await expect(
    restoredScan.getByText("Cited for Plan Name of Customer Plan"),
  ).toBeVisible();

  await openStage(page, /Plan & people/);
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(page.locator("#population-import .data-table tbody tr")).toHaveCount(
    5,
  );
  await page.getByRole("button", { name: "Plan details", exact: true }).click();
  await expect(page.getByLabel("Plan Name of Customer Plan")).toHaveValue(
    "Synthetic Dry Run Plan",
  );

  await openStage(page, /Review & export/);
  const restoredAudit = page.locator(".audit-table");
  await expect(
    restoredAudit.getByText("evidence-passage-transcribed", { exact: true }),
  ).toBeVisible();
  const restoredRows = await restoredAudit.locator("tbody tr").count();
  expect(restoredRows).toBeGreaterThanOrEqual(10);
  expect(consoleErrors).toEqual([]);

  // Step 9 — Purge the restored case and keep its audit trail readable.
  await openStage(page, /Case$/);
  const restoredCaseEntry = page
    .locator(".case-entry")
    .filter({ hasText: "CW-0002" });
  await restoredCaseEntry
    .getByRole("button", { name: "Purge data" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Purge case data for CW-0002" }),
  ).toBeVisible();
  const purgeButton = page.getByRole("button", { name: "Purge case data" });
  await page.locator(".purge-form textarea").fill("Dry run complete; close out the restored case");
  await expect(purgeButton).toBeDisabled();
  await page.locator(".purge-form input[type='text']").fill("CW-0002");
  await expect(purgeButton).toBeEnabled();
  await purgeButton.click();

  await expect(page.locator(".notice-banner")).toContainText("Purged CW-0002");
  await expect(page.getByText("Audit only")).toBeVisible();
  await page.locator(".case-list-item").filter({ hasText: "CW-0002" }).click();
  await expect(page.getByRole("heading", { name: "Case bundle" })).toBeVisible();
  await expect(page.locator(".warning-block")).toContainText(
    "This case was purged",
  );
  await expect(
    page.getByRole("button", { name: "Export review bundle" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Plan & people/ }),
  ).toBeDisabled();

  // Every request in the whole run stayed on the app's own origin.
  const appOrigin = new URL(page.url()).origin;
  const external = requests.filter(
    (url) => url.startsWith("http") && new URL(url).origin !== appOrigin,
  );
  expect(external).toEqual([]);
});
