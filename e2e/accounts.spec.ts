import { test, expect } from "@playwright/test";
import { loginAsAdmin, navLink } from "./fixtures/auth";
import { uniqueId } from "./helpers/unique";

test.describe("Accounts CRUD", () => {
  test("admin can create, update, and deactivate an account", async ({ page }) => {
    const id = uniqueId("acct");
    const name = `E2E Account ${id}`;
    const code = `E2E${id.slice(-6)}`.toUpperCase();

    await loginAsAdmin(page);
    await navLink(page, "Accounts").click();
    await expect(page.getByRole("heading", { name: "Accounts (clients)" })).toBeVisible();

    const createForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add account" }) });
    await createForm.locator('input[name="name"]').fill(name);
    await createForm.locator('input[name="code"]').fill(code);
    await createForm.locator('input[name="technology"]').fill("JAVA, React");
    await createForm.locator('input[name="domain"]').fill("Banking & Finance");
    await createForm.locator('input[name="projectManagers"]').fill("E2E PM");
    await createForm.getByRole("button", { name: "Add account" }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Accounts (clients)" })).toBeVisible();

    const rowForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Save" }) })
      .filter({ has: page.locator(`input[name="name"][value="${name}"]`) })
      .first();
    await expect(rowForm).toBeVisible({ timeout: 20_000 });

    await rowForm.locator('input[name="technology"]').fill("JAVA, .NET, React JS");
    await rowForm.locator('input[name="domain"]').fill("FinTech");
    await rowForm.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);
    await page.reload();

    const savedForm = page
      .locator("form")
      .filter({ has: page.locator(`input[name="name"][value="${name}"]`) })
      .filter({ has: page.getByRole("button", { name: "Save" }) })
      .first();
    await expect(savedForm.locator('input[name="technology"]')).toHaveValue("JAVA, .NET, React JS");

    await savedForm.locator('select[name="active"]').selectOption("no");
    await savedForm.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(500);
    await page.reload();

    const inactiveForm = page
      .locator("form")
      .filter({ has: page.locator(`input[name="name"][value="${name}"]`) })
      .filter({ has: page.getByRole("button", { name: "Save" }) })
      .first();
    await expect(inactiveForm.locator('select[name="active"]')).toHaveValue("no");
  });
});
