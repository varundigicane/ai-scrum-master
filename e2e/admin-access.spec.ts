import { test, expect } from "@playwright/test";
import { loginAsAdmin, navLink } from "./fixtures/auth";

test.describe("Admin access smoke", () => {
  test("users, permissions, and settings pages load", async ({ page }) => {
    await loginAsAdmin(page);

    await navLink(page, "Users & roles").click();
    await expect(page.getByRole("heading", { name: /Users/ })).toBeVisible();
    await expect(page.getByText(/Company Admin|Project Manager|Employee/).first()).toBeVisible();

    await navLink(page, "Feature access").click();
    await expect(page.getByRole("heading", { name: /Feature access/ })).toBeVisible();
    await expect(page.getByText(/Company Admin always has full access/i)).toBeVisible();
    // Company Admin column checkboxes are disabled
    const disabledAdminBoxes = page.locator('input[type="checkbox"][name^="perm__CompanyAdmin__"]:disabled');
    await expect(disabledAdminBoxes.first()).toBeVisible();
    await expect(disabledAdminBoxes.first()).toBeChecked();

    await navLink(page, "Settings").click();
    await expect(page.getByRole("heading", { name: /Settings/ })).toBeVisible();
  });
});
