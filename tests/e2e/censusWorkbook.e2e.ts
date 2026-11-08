/**
 * Browser check for the mapped Excel census.
 *
 * A workbook is the common real-world census, so this proves the reviewer can
 * confirm a mapping and import in Chromium, and that a value the mapping cannot
 * interpret fails closed with nothing written.
 */

import { expect, test, type Page } from "@playwright/test";
import { createSyntheticXlsx } from "../../src/app/syntheticDocuments";

const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function openStage(page: Page, name: RegExp): Promise<void> {
  const button = page.getByRole("button", { name });
  if (!(await button.isVisible())) {
    await page.locator("summary", { hasText: "Review details" }).click();
  }
  await button.click();
}

async function openPopulation(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create new case" }).click();
  await openStage(page, /Plan & people/);
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Import participant records" }),
  ).toBeVisible();
}

function workbookFile(
  bytes: Uint8Array,
  name = "synthetic-census.xlsx",
): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: XLSX_MEDIA_TYPE, buffer: Buffer.from(bytes) };
}

test("imports a mapped Excel census with text and date cells", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await openPopulation(page);

  const workbook = createSyntheticXlsx({
    sheetName: "Census",
    rows: [
      ["Synthetic plan census — no real participants"],
      [],
      ["Participant ID", "Record", "Status", "DOB", "Hire Date"],
      ["P-0001", "participant", "retired", { date: "1950-01-15" }, { date: "1975-01-15" }],
      ["P-0002", "participant", "separated-vested", { date: "1960-01-15" }, { date: "1985-01-15" }],
    ],
  });

  await page
    .getByLabel("Choose participant CSV or Excel census to import")
    .setInputFiles(workbookFile(workbook));

  await expect(
    page.getByRole("heading", { name: "Map the census columns" }),
  ).toBeVisible();
  await expect(page.getByText(/Worksheet: Census/)).toBeVisible();
  // The header row is suggested, not assumed: row 3 holds the labels.
  await expect(page.getByLabel("Header row")).toHaveValue("3");

  const importButton = page.getByRole("button", { name: "Import mapped census" });
  await expect(importButton).toBeEnabled();
  await importButton.click();

  await expect(page.locator(".notice-banner")).toContainText(
    'Imported 2 participant records from sheet “Census” of synthetic-census.xlsx.',
  );
  await expect(page.getByText(/Authoritative census:/)).toContainText(
    "synthetic-census.xlsx",
  );
  const rows = page.locator(".data-table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("P-0001");
  await expect(rows.first()).toContainText("1950-01-15");
  await expect(rows.nth(1)).toContainText("P-0002");

  // The workbook itself is the stored evidence of record.
  await openStage(page, /Documents/);
  await expect(
    page.locator(".artifact-card", { hasText: "synthetic-census.xlsx" }),
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("requires a complete mapping and refuses an unformatted date cell", async ({
  page,
}) => {
  await openPopulation(page);

  const workbook = createSyntheticXlsx({
    rows: [
      ["Employee", "Record", "Retirement status", "DOB", "Hire Date"],
      ["P-0001", "participant", "retired", 18323, "1975-01-15"],
    ],
  });

  await page
    .getByLabel("Choose participant CSV or Excel census to import")
    .setInputFiles(workbookFile(workbook));

  const importButton = page.getByRole("button", { name: "Import mapped census" });
  // "Employee" is not a recognized alias, so the required mapping is
  // incomplete and the import stays disabled until the reviewer chooses.
  await expect(importButton).toBeDisabled();
  await expect(
    page.getByText("Participant key is not mapped."),
  ).toBeVisible();
  await expect(page.getByLabel(/^Participant key \(required\)/)).toHaveValue("");
  await expect(page.getByLabel(/^Status \(required\)/)).toHaveValue("2");

  await page.getByLabel(/^Participant key \(required\)/).selectOption("0");
  await expect(importButton).toBeEnabled();
  await importButton.click();

  // 18323 is a bare number, not a date-formatted cell: nothing is written.
  await expect(page.getByRole("alert")).toContainText(
    "is a plain number, not a date-formatted cell",
  );
  await expect(
    page.getByText("No participant records imported"),
  ).toBeVisible();
});
