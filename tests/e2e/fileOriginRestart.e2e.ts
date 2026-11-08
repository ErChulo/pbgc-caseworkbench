/**
 * The storage claim a reviewer actually depends on: closing the browser and
 * opening the local file again.
 *
 * `fileOrigin.e2e.ts` proves a reload. This test closes the whole browser,
 * relaunches the same dedicated profile, and checks that the case, its evidence
 * bytes, and its audit trail are still there, and that the store still accepts
 * a write. If the browser refuses file-page storage, the honest session-only
 * answer is checked and the test is skipped: there is no persistence to prove.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createSyntheticPdf } from "../../src/app/syntheticDocuments";

const APP_FILE = pathToFileURL(resolve("dist/index.html")).href;
const PLAN_TEXT =
  "Section 4.1: Normal retirement age is 65 with 5 years of service.";

async function launch(profileDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
  });
}

async function open(page: Page): Promise<void> {
  await page.goto(APP_FILE);
  await expect(page.locator(".shell")).toHaveAttribute(
    "data-storage-mode",
    /persistent|session/,
    { timeout: 30_000 },
  );
}

async function openStage(page: Page, name: RegExp): Promise<void> {
  // Stage buttons only: the walkthrough panel also offers "Go to …" buttons,
  // and the technical stages live under the "Review details" disclosure.
  const button = page.locator("button.stage").filter({ hasText: name });
  if (!(await button.isVisible())) {
    await page.locator("summary", { hasText: "Review details" }).click();
  }
  await button.click();
}

test("keeps the case, evidence bytes, and audit trail across a full browser restart", async () => {
  const profileDir = await mkdtemp(join(tmpdir(), "pbgc-file-restart-"));
  const external: string[] = [];
  const consoleErrors: string[] = [];
  let context: BrowserContext | null = null;

  function watch(page: Page): void {
    page.on("request", (request) => {
      if (!/^(file|data|blob):/.test(request.url())) external.push(request.url());
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
  }

  try {
    context = await launch(profileDir);
    let page = context.pages()[0]!;
    watch(page);
    await open(page);

    if ((await page.locator(".shell").getAttribute("data-storage-mode")) === "session") {
      // Refusing honestly is supported; a restart has nothing to prove then.
      await expect(page.getByRole("alert").first()).toContainText(
        "This tab cannot save a case",
      );
      test.skip(
        true,
        "The browser refused file-page storage; session-only mode has no persistence to survive a restart.",
      );
    }

    await page.getByRole("button", { name: "Create new case" }).click();
    await expect(
      page.getByRole("heading", { name: "Plan-level fields" }),
    ).toBeVisible();
    const alias = (await page.locator(".case-bar h1").innerText()).trim();
    expect(alias).toMatch(/^CW-\d{4}$/);

    await page.getByLabel("Case Identification Number").fill("CASE0049");
    await page.getByLabel("Case Number of Customer Plan").fill("9049");
    await page
      .getByLabel("Date of Plan Termination for Customer Plan")
      .fill("2024-03-31");
    await page
      .getByLabel("Plan Name of Customer Plan")
      .fill("Synthetic Restart Plan");
    await page.getByRole("button", { name: "Save plan fields" }).click();
    await expect(page.getByText("Plan fields saved and audited.")).toBeVisible();

    await openStage(page, /Documents/);
    await page
      .getByLabel("Document type for new files")
      .selectOption("plan-documents");
    await page.getByLabel("Choose evidence files to import").setInputFiles({
      name: "restart-plan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        createSyntheticPdf([["Synthetic restart plan"], [PLAN_TEXT]]),
      ),
    });
    const planCard = page
      .locator(".artifact-card")
      .filter({ hasText: "restart-plan.pdf" });
    await expect(planCard).toBeVisible();
    await planCard.getByRole("button", { name: "Read text" }).click();
    await expect(
      planCard.getByText("Page 2", { exact: true }),
    ).toBeVisible();

    await openStage(page, /Review & export/);
    const auditBefore = await page.locator(".audit-table tbody tr").count();
    expect(auditBefore).toBeGreaterThan(2);

    // The whole browser, not a reload.
    await context.close();
    context = await launch(profileDir);
    page = context.pages()[0]!;
    watch(page);
    await open(page);

    await expect(page.locator(".shell")).toHaveAttribute(
      "data-storage-mode",
      "persistent",
    );
    await expect(page.locator(".case-bar h1")).toContainText(alias);

    // Evidence bytes survived: verification recomputes SHA-256 from storage.
    await openStage(page, /Documents/);
    await expect(page.locator(".artifact-name")).toHaveText("restart-plan.pdf");
    await page.getByRole("button", { name: "Verify active evidence" }).click();
    await expect(
      page.getByText(
        /Verified 1 stored evidence file against the recorded SHA-256/,
      ),
    ).toBeVisible();
    await expect(
      page.locator(".artifact-card").getByText("Integrity: verified"),
    ).toHaveCount(1);

    // The store still accepts a write after the restart.
    await page
      .getByLabel("Document type for new files")
      .selectOption("plan-documents");
    await page.getByLabel("Choose evidence files to import").setInputFiles({
      name: "restart-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic restart note.\n"),
    });
    await expect(page.locator(".artifact-card")).toHaveCount(2);

    await openStage(page, /Review & export/);
    expect(await page.locator(".audit-table tbody tr").count()).toBeGreaterThan(
      auditBefore,
    );

    expect(external).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    await context?.close();
    await rm(profileDir, { recursive: true, force: true });
  }
});
