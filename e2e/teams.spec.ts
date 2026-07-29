import { test, expect } from "@playwright/test";
import { loginAsAdmin, loginAsEmployee, navLink } from "./fixtures/auth";

test.describe("MS Teams admin page", () => {
  test("admin can open the Teams page and see its sections", async ({ page }) => {
    await loginAsAdmin(page);

    await navLink(page, "MS Teams").click();
    await expect(page.getByRole("heading", { name: "MS Teams", level: 2 })).toBeVisible();

    await expect(page.getByText("Environment")).toBeVisible();
    await expect(page.getByText("Company settings")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linked people", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Connected channels", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent bot activity", level: 3 })).toBeVisible();
  });

  test("admin can toggle the Teams agent on and off", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/dashboard/teams");

    const enable = page.locator('input[name="enabled"]');
    await enable.check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(enable).toBeChecked();

    await enable.uncheck();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(enable).not.toBeChecked();
  });

  test("employee cannot see or reach the Teams page", async ({ page }) => {
    await loginAsEmployee(page);

    await expect(navLink(page, "MS Teams")).toHaveCount(0);

    await page.goto("/dashboard/teams");
    await page.waitForURL(/\/dashboard\/?$/);
    await expect(page).not.toHaveURL(/\/dashboard\/teams/);
  });
});
