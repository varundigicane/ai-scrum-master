import { test, expect } from "@playwright/test";
import { loginAsAdmin, navLink } from "./fixtures/auth";

test.describe("Workboard", () => {
  test("admin can open workboard and switch periods", async ({ page }) => {
    await loginAsAdmin(page);
    await navLink(page, "Work breakdown").click();
    await expect(page.getByRole("heading", { name: "Work breakdown" })).toBeVisible();

    const filter = page.locator("form").filter({ has: page.getByRole("button", { name: "Apply" }) });
    await filter.locator('select[name="period"]').selectOption("day");
    await filter.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/Period window:/i)).toBeVisible();

    await filter.locator('select[name="period"]').selectOption("week");
    await filter.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/Period window:/i)).toBeVisible();

    await filter.locator('select[name="period"]').selectOption("month");
    await filter.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/Period window:/i)).toBeVisible();

    await expect(page.getByRole("columnheader", { name: /Est/i }).first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Planned/i }).first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Actual/i }).first()).toBeVisible();
  });
});
