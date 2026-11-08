/**
 * Browser check for the pre-import file check.
 *
 * The check runs before a case exists, so the test also asserts the property
 * that makes it safe on real material: after checking three files — including
 * one it refuses — the workstation still holds no case and no case content.
 *
 * Synthetic files only. Nothing here is a real document or a real participant.
 */

import { expect, test } from "@playwright/test";
import {
  createSyntheticPdf,
  createSyntheticXlsx,
} from "../../src/app/syntheticDocuments";

const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

test("checks files before importing and stores nothing", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByText("No active case")).toBeVisible();

  await page
    .locator("summary", { hasText: "Check files before importing" })
    .click();
  await expect(
    page.getByText(
      "Nothing is stored: no case is created, no file is imported, and no audit event is written.",
      { exact: false },
    ),
  ).toBeVisible();

  const census = createSyntheticXlsx({
    sheetName: "Census",
    rows: [
      ["Participant ID", "Type", "Status", "DOB", "Hire Date"],
      ["P-0001", "participant", "retired", { date: "1940-04-12" }, { date: "1966-03-01" }],
      ["P-0002", "participant", "active-vested", { date: "1955-09-30" }, { date: "1980-01-02" }],
    ],
  });

  await page.getByLabel("Choose files to check").setInputFiles([
    {
      name: "plan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        createSyntheticPdf([
          ["Section 3.2(b): Normal retirement age is 65 with 5 years of service."],
        ]),
      ),
    },
    {
      name: "scan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(createSyntheticPdf([[]])),
    },
    {
      name: "census.xlsx",
      mimeType: XLSX_MEDIA_TYPE,
      buffer: Buffer.from(census),
    },
  ]);

  const reports = page.getByRole("list", { name: "Preflight reports" });
  await expect(reports).toBeVisible();

  const plan = reports.locator("li", { hasText: "plan.pdf" });
  await expect(plan).toContainText("Would import");
  await expect(plan).toContainText("All 1 page carries a text layer.");

  const scan = reports.locator("li", { hasText: "scan.pdf" });
  await expect(scan).toContainText("Would be refused");
  await expect(scan).toContainText("no text this workbench can read");

  const sheet = reports.locator("li", { hasText: "census.xlsx" });
  await expect(sheet).toContainText("Would import");
  await expect(sheet).toContainText(
    "Sheet “Census”: 2 participant rows map cleanly from header row 1.",
  );

  // The check leaves no case and no case content behind.
  await expect(page.getByText("No active case")).toBeVisible();
  await expect(page.getByText("No cases on this workstation")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
