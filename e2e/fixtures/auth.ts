import type { Page } from "@playwright/test";

export const DEMO_PASSWORD = "password123";

export const USERS = {
  admin: { email: "admin@acme.local", roleLabel: "Company Admin" },
  pm: { email: "pm@acme.local", roleLabel: "Project Manager" },
  employee: { email: "alex@acme.local", roleLabel: "Employee" },
} as const;

/** Log in via the UI login form and wait for the dashboard. */
export async function loginAs(
  page: Page,
  email: string,
  password: string = DEMO_PASSWORD,
) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

export async function loginAsAdmin(page: Page) {
  await loginAs(page, USERS.admin.email);
}

export async function loginAsPm(page: Page) {
  await loginAs(page, USERS.pm.email);
}

export async function loginAsEmployee(page: Page) {
  await loginAs(page, USERS.employee.email);
}

/** Sidebar nav link by visible label. */
export function navLink(page: Page, label: string) {
  return page.locator("aside nav").getByRole("link", { name: label, exact: true });
}
