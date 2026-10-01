import { expect, test } from "@playwright/test";
import { registerAndCompleteOnboarding } from "./helpers";

/**
 * Flow 4 of the brief's 5: one student creates a study group, a second joins
 * it with the invite code, and both see each other on the board.
 *
 * Two real accounts in two separate browser contexts — there is deliberately
 * no group directory or search (PLAN.md §5b), so a code is the only way in,
 * and that is exactly what this test has to prove actually works.
 */
test("creating a group and joining it with the invite code shows both members", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await registerAndCompleteOnboarding(ownerPage);

  await ownerPage.goto("/insights");
  await ownerPage.getByRole("button", { name: "Create a group" }).click();
  await ownerPage.getByLabel("Group name").fill("E2E Test Group");
  await ownerPage.getByRole("button", { name: "Create a group" }).click();

  // The join code (7 chars, A-Z/2-9 minus ambiguous I/O/0/1 — see
  // generateJoinCode in server/study-group-service.ts) is shown as plain text
  // next to a copy button once the group exists.
  const codeButton = ownerPage.getByRole("button", { name: /^[A-HJ-NP-Z2-9]{7}$/ });
  await expect(codeButton).toBeVisible({ timeout: 15_000 });
  const joinCode = (await codeButton.textContent())?.trim();
  expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{7}$/);

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await registerAndCompleteOnboarding(memberPage);

  await memberPage.goto("/insights");
  await memberPage.getByRole("button", { name: "Join with a code" }).click();
  await memberPage.getByLabel("Invite code").fill(joinCode!);
  await memberPage.getByRole("button", { name: "Join with a code" }).click();

  await expect(memberPage.getByText("E2E Test Group")).toBeVisible({ timeout: 15_000 });
  await expect(memberPage.getByText("2 members")).toBeVisible();

  // The owner's page was rendered before the second member joined, so it
  // needs a reload to see the updated membership.
  await ownerPage.reload();
  await expect(ownerPage.getByText("2 members")).toBeVisible({ timeout: 15_000 });

  await ownerContext.close();
  await memberContext.close();
});
