import { expect, test } from "@playwright/test";
import { registerAndCompleteOnboarding } from "./helpers";

/**
 * Flow 5 of the brief's 5: download a GDPR data export, then delete the
 * account through its typed-confirmation dialog, then confirm the account is
 * genuinely gone — logging back in with the same credentials is refused.
 *
 * This is also the one e2e flow that cleans up after itself: every other spec
 * in this suite leaves its test account behind (see onboarding.spec.ts), but
 * this one's whole job is to delete the account it just created.
 *
 * The AI advisor flow described in PLAN.md's Session 10 "verify by" column
 * ("ask... and approve the proposed change") was deliberately left out here
 * rather than made a 6th spec: every real exchange is a paid, non-deterministic
 * API call, and PLAN.md repeatedly flags that kind of call as something to
 * trigger deliberately and under supervision, not something a test suite
 * re-runs on every pass (see §"Session 24" and §"Session 25" notes on what
 * was/wasn't checked live for exactly that reason).
 */
test("downloading account data and deleting the account both work, and login is refused afterwards", async ({
  page,
}) => {
  const { email } = await registerAndCompleteOnboarding(page);

  await page.goto("/settings");
  await page.getByRole("tab", { name: "Privacy" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download my data" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  await page.getByRole("button", { name: "Delete my account" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(`Type ${email} to confirm`).fill(email);
  await dialog.getByRole("button", { name: "Delete my account" }).click();

  // A successful deletion signs out and redirects to "/" — see
  // features/settings/actions.ts.
  await page.waitForURL("http://localhost:3000/");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("E2E-Test-Password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("do not match", { exact: false })).toBeVisible({ timeout: 15_000 });
});
