import { test, expect } from "@playwright/test";
import { loginAsAdmin, USERS, DEMO_PASSWORD } from "./fixtures/auth";

test.describe("Auth", () => {
  test("unauthenticated dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("invalid credentials show error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("admin@acme.local");
    await page.locator("#password").fill("wrong-password");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
  });

  test("admin login lands on dashboard with Company Admin", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(USERS.admin.roleLabel)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Delivery HQ" })).toBeVisible();
  });

  test("demo password works for admin", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(USERS.admin.email);
    await page.locator("#password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
