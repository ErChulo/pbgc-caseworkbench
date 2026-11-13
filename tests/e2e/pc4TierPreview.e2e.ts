import { expect, test } from "@playwright/test";

test("PC4(A) Tier 1 funds before PC4(B) Tier 2 in offline workbench preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name:"Create new case" }).click();
  const nav = page.getByRole("button", { name:/Calculations/ });
  if (!(await nav.isVisible())) {
    await page.locator("summary", { hasText:"Review details" }).click();
  }
  await nav.click();
  const panel = page.locator("#pc4-a-b-allocation");
  await expect(panel.getByRole("heading",{name:"PC4(A) / Tier 1 and PC4(B) / Tier 2"})).toBeVisible();
  await expect(panel.getByText(/Preview only/)).toBeVisible();

  await panel.getByLabel("Allocation valuation date").fill("2026-06-30");
  await panel.getByLabel("Present-value basis identifier").fill("synthetic-pv-basis");
  await panel.getByLabel("Assets available after PC1-PC3 (PV dollars)").fill("110.00");
  await panel.getByLabel("Participant alias (not PII)").fill("fictional-owner");
  await panel.getByLabel("Majority-owner classification").selectOption("majority-owner");
  await panel.getByLabel("PC4(A): guaranteed PV").fill("100.00");
  await panel.getByLabel("PC4(A): aggregate-limit PV").fill("0.00");
  await panel.getByLabel("PC4(B): majority-owner PV").fill("50.00");
  await panel.getByRole("button",{name:"Evaluate PC4 funding"}).click();

  const report = panel.getByRole("region", { name:"Unapproved PC4 funding preview" });
  await expect(report).toBeVisible();
  await expect(report).toContainText("Tier 1 total PV");
  await expect(report).toContainText("Assets assigned to Tier 1");
  await expect(report).toContainText("Assets assigned to Tier 2");
  await expect(report).toContainText("tier2-shortfall");
  await expect(report).toContainText("1000/5000 (exact)");

  // An underfunded Tier 1 does not allocate any dollars to Tier 2.
  await panel.getByLabel("Assets available after PC1-PC3 (PV dollars)").fill("99.99");
  await panel.getByRole("button",{name:"Evaluate PC4 funding"}).click();
  await expect(report).toContainText("tier1-shortfall");
  await expect(report).toContainText("unresolved");

  // Non-owner has no access to PC4(B) majority-owner amounts.
  await panel.getByLabel("Majority-owner classification").selectOption("not-majority-owner");
  await panel.getByRole("button",{name:"Evaluate PC4 funding"}).click();
  await expect(panel.getByRole("alert")).toContainText("majority-owner status");
  await expect(report).toHaveCount(0);
});
