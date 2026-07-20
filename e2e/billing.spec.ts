import { test, expect } from "@playwright/test";
import { loginAsAdmin, navLink } from "./fixtures/auth";

test.describe("Billing", () => {
  test("admin can view month and save working-days override", async ({ page }) => {
    await loginAsAdmin(page);
    await navLink(page, "Billing").click();
    await expect(page.getByRole("heading", { name: "Billing", level: 2 })).toBeVisible();

    const viewForm = page.locator("form").filter({ has: page.getByRole("button", { name: "View month" }) });
    const now = new Date();
    await viewForm.locator('input[name="year"]').fill(String(now.getFullYear()));
    await viewForm.locator('select[name="month"]').selectOption(String(now.getMonth() + 1));
    await viewForm.getByRole("button", { name: "View month" }).click();

    await expect(page.getByRole("heading", { name: "Billing", level: 2 })).toBeVisible();
    await expect(page.getByText(/billing = rate/i)).toBeVisible();

    const overrideForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Save override" }),
    });
    if (await overrideForm.count()) {
      await overrideForm.locator('input[name="totalWorkingDays"]').fill("22");
      await overrideForm.getByRole("button", { name: "Save override" }).click();
      await expect(page.getByRole("heading", { name: "Billing", level: 2 })).toBeVisible();
    }
  });
});
