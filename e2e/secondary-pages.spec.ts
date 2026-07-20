import { test, expect } from "@playwright/test";
import { loginAsAdmin, navLink } from "./fixtures/auth";

test.describe("Secondary pages smoke", () => {
  test("admin can open status, quality, leaves, reports, agent", async ({ page }) => {
    await loginAsAdmin(page);

    await navLink(page, "Daily status").click();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();

    await navLink(page, "Quality / RCA").click();
    await expect(page.getByRole("heading", { name: /Quality/i, level: 2 })).toBeVisible();

    await navLink(page, "Leaves").click();
    await expect(
      page.getByRole("heading", { name: "Leaves & extra working days", level: 2 }),
    ).toBeVisible();

    await navLink(page, "Weekly reports").click();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();

    await navLink(page, "AI agent").click();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  });
});
