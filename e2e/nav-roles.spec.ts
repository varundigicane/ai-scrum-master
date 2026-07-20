import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsEmployee, navLink } from "./fixtures/auth";

test.describe("Role navigation", () => {
  test("admin sees delivery and admin menus", async ({ page }) => {
    await loginAsAdmin(page);

    const expected = [
      "Overview",
      "Accounts",
      "Projects",
      "Epic / Story / Task",
      "Resources",
      "Users & roles",
      "Feature access",
      "Billing",
      "Work breakdown",
      "GTS Report",
      "Daily status",
      "Settings",
    ];

    for (const label of expected) {
      await expect(navLink(page, label)).toBeVisible();
    }
  });

  test("employee sees limited menus and not accounts/users", async ({ page }) => {
    await loginAsEmployee(page);

    await expect(navLink(page, "Overview")).toBeVisible();
    await expect(navLink(page, "Projects")).toBeVisible();
    await expect(navLink(page, "Epic / Story / Task")).toBeVisible();
    await expect(navLink(page, "Work breakdown")).toBeVisible();
    await expect(navLink(page, "Daily status")).toBeVisible();

    await expect(navLink(page, "Accounts")).toHaveCount(0);
    await expect(navLink(page, "Users & roles")).toHaveCount(0);
    await expect(navLink(page, "Feature access")).toHaveCount(0);
    await expect(navLink(page, "Settings")).toHaveCount(0);
  });

  test("employee direct visit to accounts redirects to dashboard", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/dashboard/accounts");
    await page.waitForURL(/\/dashboard\/?$/);
    await expect(page).not.toHaveURL(/\/dashboard\/accounts/);
  });
});
