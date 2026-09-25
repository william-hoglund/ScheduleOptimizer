import { expect, test } from "@playwright/test";
import { registerAndCompleteOnboarding } from "./helpers";

/**
 * Flow 2 of the brief's 5, and the actual core loop of the product: add a
 * task, generate a plan, approve it, see it on the calendar. Session 5's
 * engine and Session 6's approval flow predate this test by a long way — this
 * exists to catch a regression in either, not to prove they work for the
 * first time.
 */
test("adding a task, generating a plan and approving it reaches the calendar", async ({ page }) => {
  await registerAndCompleteOnboarding(page);

  await page.goto("/deadlines");
  await page.getByRole("button", { name: "Add your first deadline" }).click();
  await page.getByLabel("What needs doing?").fill("E2E Test Assignment");

  const deadline = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);
  await page.getByLabel("Deadline").fill(deadline);
  await page.getByLabel("Estimated time").fill("120");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("E2E Test Assignment")).toBeVisible();

  await page.goto("/planner");
  await page.getByRole("button", { name: "Generate a plan" }).click();
  await expect(page.getByText("Your proposed plan")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Approve this plan" }).click();
  // Approving navigates straight to the calendar — the sessions themselves
  // are the confirmation, not a message (see PLAN.md §"Session 6 decisions").
  await page.waitForURL(/\/calendar/, { timeout: 15_000 });
});
