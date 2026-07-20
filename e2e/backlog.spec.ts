import { test, expect } from "@playwright/test";
import { loginAsAdmin, navLink } from "./fixtures/auth";
import { uniqueId } from "./helpers/unique";

test.describe("Backlog / WBS", () => {
  test("admin can add epic, story, and task with estimate/dates", async ({ page }) => {
    const id = uniqueId("bl");
    const epicTitle = `E2E Epic ${id}`;
    const storyTitle = `E2E Story ${id}`;
    const taskTitle = `E2E Task ${id}`;

    await loginAsAdmin(page);
    await navLink(page, "Epic / Story / Task").click();
    await expect(page.getByRole("heading", { name: "Epic / Story / Task" })).toBeVisible();

    const manageLink = page.getByRole("link", { name: "Manage Epic / Story / Task" }).first();
    await expect(manageLink).toBeVisible();
    await manageLink.click();
    await expect(page.getByRole("heading", { name: /Backlog/i })).toBeVisible();

    const reqList = page.locator("section").filter({
      has: page.getByRole("heading", { name: "List · Epic / Feature / Story" }),
    });
    const addReq = page.locator("form").filter({ hasText: "Add Epic / Feature / Story" }).first();
    await expect(addReq).toBeVisible();
    await addReq.locator('input[name="title"]').fill(epicTitle);
    await addReq.locator('select[name="kind"]').selectOption("epic");
    await addReq.getByRole("button", { name: "Add backlog item" }).click();
    await page.waitForTimeout(600);
    await page.reload();
    await expect(reqList.locator("td").filter({ hasText: epicTitle }).first()).toBeVisible({
      timeout: 20_000,
    });

    const addReq2 = page.locator("form").filter({ hasText: "Add Epic / Feature / Story" }).first();
    await addReq2.locator('input[name="title"]').fill(storyTitle);
    await addReq2.locator('select[name="kind"]').selectOption("story");
    const parentSelect = addReq2.locator('select[name="parentId"]');
    const options = await parentSelect.locator("option").allTextContents();
    const epicOpt = options.find((o) => o.includes(epicTitle));
    if (epicOpt) {
      await parentSelect.selectOption({ label: epicOpt });
    }
    await addReq2.getByRole("button", { name: "Add backlog item" }).click();
    await page.waitForTimeout(600);
    await page.reload();
    await expect(reqList.locator("td").filter({ hasText: storyTitle }).first()).toBeVisible({
      timeout: 20_000,
    });

    const taskList = page.locator("section").filter({
      has: page.getByRole("heading", { name: "List · Task / Subtask" }),
    });
    const taskForm = page.locator("form").filter({ hasText: "Add Task / Subtask" }).first();
    await expect(taskForm).toBeVisible();
    await taskForm.locator('input[name="title"]').fill(taskTitle);
    if (await taskForm.locator('textarea[name="description"]').count()) {
      await taskForm.locator('textarea[name="description"]').fill("E2E task description");
    }
    if (await taskForm.locator('input[name="estimateDays"]').count()) {
      await taskForm.locator('input[name="estimateDays"]').fill("2.5");
    }
    if (await taskForm.locator('input[name="startDate"]').count()) {
      const today = new Date();
      await taskForm.locator('input[name="startDate"]').fill(today.toISOString().slice(0, 10));
      await taskForm
        .locator('input[name="endDate"]')
        .fill(new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10));
    }
    await taskForm.getByRole("button", { name: "Add task" }).click();
    await page.waitForTimeout(600);
    await page.reload();
    await expect(taskList.locator("td").filter({ hasText: taskTitle }).first()).toBeVisible({
      timeout: 20_000,
    });

    const taskRow = taskList.locator("tr").filter({ hasText: taskTitle }).first();
    if ((await taskRow.getByText("Edit / Delete").count()) > 0) {
      await taskRow.getByText("Edit / Delete").first().click();
      const updateForm = taskRow.locator("form").filter({ has: page.getByRole("button", { name: "Update" }) });
      await updateForm.locator('input[name="title"]').fill(`${taskTitle} Updated`);
      await updateForm.getByRole("button", { name: "Update" }).click();
      await page.waitForTimeout(600);
      await page.reload();
      await expect(
        taskList.locator("td").filter({ hasText: `${taskTitle} Updated` }).first(),
      ).toBeVisible({ timeout: 20_000 });

      const updatedRow = taskList.locator("tr").filter({ hasText: `${taskTitle} Updated` }).first();
      await updatedRow.getByText("Edit / Delete").first().click();
      await updatedRow
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Delete" }) })
        .getByRole("button", { name: "Delete" })
        .click();
      await page.waitForTimeout(600);
      await page.reload();
      await expect(taskList.locator("td").filter({ hasText: `${taskTitle} Updated` })).toHaveCount(0, {
        timeout: 20_000,
      });
    }
  });
});
