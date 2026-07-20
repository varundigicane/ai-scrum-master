import { test, expect } from "@playwright/test";
import { loginAsAdmin, navLink } from "./fixtures/auth";
import { uniqueEmail, uniqueId } from "./helpers/unique";

test.describe("Resources CRUD", () => {
  test("admin can create, update, and deactivate a resource", async ({ page }) => {
    const id = uniqueId("res");
    const name = `E2E Resource ${id}`;
    const email = uniqueEmail("res");
    const empId = `E${id.slice(-5)}`.toUpperCase();

    await loginAsAdmin(page);
    await navLink(page, "Resources").click();
    await expect(page.getByRole("heading", { name: "Resources" })).toBeVisible();

    const createForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add resource" }) });
    await createForm.locator('input[name="employeeId"]').fill(empId);
    await createForm.locator('input[name="name"]').fill(name);
    await createForm.locator('input[name="email"]').fill(email);
    await createForm.getByRole("button", { name: "Add resource" }).click();
    await page.waitForTimeout(800);
    await page.reload();

    const rowForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Save" }) })
      .filter({ has: page.locator(`input[name="name"][value="${name}"]`) })
      .first();
    await expect(rowForm).toBeVisible({ timeout: 20_000 });

    const updatedName = `${name} Updated`;
    await rowForm.locator('input[name="name"]').fill(updatedName);
    await rowForm.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);
    await page.reload();

    const updatedForm = page
      .locator("form")
      .filter({ has: page.locator(`input[name="name"][value="${updatedName}"]`) })
      .filter({ has: page.getByRole("button", { name: "Save" }) })
      .first();
    await expect(updatedForm).toBeVisible({ timeout: 20_000 });

    await updatedForm.locator('select[name="active"]').selectOption("no");
    await updatedForm.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);
    await page.reload();

    const inactiveForm = page
      .locator("form")
      .filter({ has: page.locator(`input[name="name"][value="${updatedName}"]`) })
      .filter({ has: page.getByRole("button", { name: "Save" }) })
      .first();
    await expect(inactiveForm.locator('select[name="active"]')).toHaveValue("no");
  });
});
