import { test, expect } from "@playwright/test";
import { loginAsAdmin, navLink } from "./fixtures/auth";
import { uniqueId } from "./helpers/unique";

test.describe("Projects + assignment", () => {
  test("admin can create project, assign resource, open backlog", async ({ page }) => {
    const id = uniqueId("proj");
    const projectName = `E2E Project ${id}`;

    await loginAsAdmin(page);
    await navLink(page, "Projects").click();
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

    const createForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add project" }) });
    const accountSelect = createForm.locator('select[name="accountId"]');
    const accountCount = await accountSelect.locator("option").count();
    test.skip(accountCount === 0, "No accounts available to create a project");

    await createForm.locator('input[name="name"]').fill(projectName);
    await createForm.locator('select[name="phase"]').selectOption("Dev");
    await createForm.locator('select[name="billable"]').selectOption("yes");
    await createForm.getByRole("button", { name: "Add project" }).click();

    await expect(page.getByRole("link", { name: projectName })).toBeVisible({ timeout: 20_000 });

    const assignForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Assign / update" }),
    });
    const matching = await assignForm.locator('select[name="projectId"] option').allTextContents();
    const match = matching.find((t) => t.includes(projectName));
    expect(match).toBeTruthy();
    await assignForm.locator('select[name="projectId"]').selectOption({ label: match! });
    const resourceSelect = assignForm.locator('select[name="resourceId"]');
    if ((await resourceSelect.locator("option").count()) > 0) {
      await resourceSelect.selectOption({ index: 0 });
      await assignForm.locator('input[name="hourlyRate"]').fill("55");
      await assignForm.getByRole("button", { name: "Assign / update" }).click();
    }

    await page.getByRole("link", { name: projectName }).click();
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByRole("link", { name: /Manage Epic \/ Story \/ Task/i }).first()).toBeVisible();

    await navLink(page, "Projects").click();
    const row = page.locator("tr").filter({ hasText: projectName });
    await row.getByRole("link", { name: "Manage Epic / Story / Task" }).click();
    await expect(page.getByRole("heading", { name: /Backlog/i })).toBeVisible();

    await navLink(page, "Projects").click();
    const manageRow = page.locator("tr").filter({ hasText: projectName });
    await manageRow.getByText("Edit / deactivate").click();
    const editForm = manageRow.locator("form").filter({ has: page.getByRole("button", { name: "Save" }) });
    await editForm.locator('select[name="active"]').selectOption("no");
    await editForm.getByRole("button", { name: "Save" }).click();
    await expect(editForm.locator('select[name="active"]')).toHaveValue("no", { timeout: 20_000 });
  });
});
