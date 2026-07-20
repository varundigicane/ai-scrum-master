import { test, expect } from "@playwright/test";
import { loginAsAdmin, navLink } from "./fixtures/auth";

test.describe("GTS Report", () => {
  test("admin can generate GTS month and edit lines when present", async ({ page }) => {
    await loginAsAdmin(page);
    await navLink(page, "GTS Report").click();
    await expect(page.getByRole("heading", { name: "GTS Report" })).toBeVisible();

    const openForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Open month" }) });
    const accountSelect = openForm.locator('select[name="accountId"]');
    const options = await accountSelect.locator("option").allTextContents();
    test.skip(options.length === 0 || (options.length === 1 && !options[0].trim()), "No accounts");

    const cibc = options.find((o) => /CIBC/i.test(o));
    if (cibc) {
      await accountSelect.selectOption({ label: cibc });
    } else {
      await accountSelect.selectOption({ index: 0 });
    }
    await openForm.getByRole("button", { name: "Open month" }).click();

    const generateBtn = page.getByRole("button", { name: /Generate GTS month|Refresh from system data/i });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    await expect(page.getByRole("heading", { name: "Project characteristics" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Sub-projects/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Month totals" })).toBeVisible();

    const saveLine = page
      .locator("form")
      .filter({ has: page.locator('input[name="subProjectName"]') })
      .filter({ has: page.getByRole("button", { name: "Save" }) })
      .first();
    if (await saveLine.count()) {
      await saveLine.locator('input[name="remarks"]').fill("E2E GTS remark");
      await saveLine.getByRole("button", { name: "Save" }).click();
      await expect(saveLine.locator('input[name="remarks"]')).toHaveValue("E2E GTS remark", {
        timeout: 20_000,
      });
    }
  });
});
