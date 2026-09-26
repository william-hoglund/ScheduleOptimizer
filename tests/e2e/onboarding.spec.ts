import { expect, test } from "@playwright/test";

/**
 * Flow 1 of the brief's 5: register → onboarding → dashboard.
 *
 * Creates a real account against the live Supabase project in `.env.local`
 * (email confirmation must be off — see PLAN.md §"Session 2 verification
 * record"). Each run uses a fresh email, so nothing needs cleaning up between
 * runs, but nothing cleans up after itself either: this is a dev-only check,
 * not something to point at a production project with real users.
 */
test("a new student can register, complete onboarding, and reach the dashboard", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Test Student");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("E2E-Test-Password-1!");
  await page.getByRole("button", { name: "Create account" }).click();

  // Step 1: basics. Timezone/segment/locale defaults are fine as-is.
  await expect(page.getByText("STEP 1 OF 6")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("What should we call you?").fill("E2E Test Student");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: institution/program — optional, skip it.
  await expect(page.getByText("STEP 2 OF 6")).toBeVisible();
  await page.getByRole("button", { name: "Skip this" }).click();

  // Step 3: at least one course is required before Continue is enabled.
  await expect(page.getByText("STEP 3 OF 6")).toBeVisible();
  await page.getByRole("button", { name: "Add course" }).click();
  await page.getByPlaceholder("Statistics for Engineers").fill("E2E Test Course");
  await page.getByPlaceholder("MSG830").fill("E2E101");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByPlaceholder("Statistics for Engineers")).not.toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: study preferences — defaults are fine.
  await expect(page.getByText("STEP 4 OF 6")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 5: the payoff — one deadline generates a real first plan.
  await expect(page.getByText("STEP 5 OF 6")).toBeVisible();
  await page.getByLabel("What's coming up?").fill("E2E Test Assignment");
  await page.getByRole("button", { name: "Show me my plan" }).click();

  // Step 6: done, with the plan summary from the step above.
  await expect(page.getByText("Your first plan", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // Onboarding cannot be re-entered once complete (PLAN.md §"Session 3
  // verification record") — a stray redirect back here would be a real bug.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/dashboard/);
});
