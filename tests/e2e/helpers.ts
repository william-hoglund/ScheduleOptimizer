import type { Page } from "@playwright/test";

/**
 * Registers a fresh account and walks it through onboarding with one course,
 * landing on the dashboard. Every other e2e flow needs an onboarded account
 * to get anywhere, so this is the shared setup — `onboarding.spec.ts` itself
 * doesn't use it, since testing onboarding step by step is the whole point
 * there.
 *
 * Each call creates a real account against the live Supabase project in
 * `.env.local` (email confirmation must be off). The random suffix keeps
 * parallel or repeated runs from colliding.
 */
export async function registerAndCompleteOnboarding(
  page: Page,
  { courseTitle = "E2E Test Course", courseCode = "E2E101" }: { courseTitle?: string; courseCode?: string } = {},
): Promise<{ email: string }> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Test Student");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("E2E-Test-Password-1!");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.getByLabel("What should we call you?").fill("E2E Test Student");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Skip this" }).click();

  await page.getByRole("button", { name: "Add course" }).click();
  await page.getByPlaceholder("Statistics for Engineers").fill(courseTitle);
  await page.getByPlaceholder("MSG830").fill(courseCode);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByPlaceholder("Statistics for Engineers").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Continue" }).click();

  // Preferences: defaults are fine.
  await page.getByRole("button", { name: "Continue" }).click();

  // The first-plan step is optional — this helper is for flows that don't
  // care about it, so skip straight past it.
  await page.getByRole("button", { name: "Skip this" }).click();

  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await page.waitForURL(/\/dashboard/);

  return { email };
}
