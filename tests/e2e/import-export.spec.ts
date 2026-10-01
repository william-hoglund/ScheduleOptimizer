import { expect, test } from "@playwright/test";
import { registerAndCompleteOnboarding } from "./helpers";

/**
 * Flow 3 of the brief's 5: import a timetable, review it, confirm it, then
 * export the plan back out. Session 9 shipped both directions as one piece
 * of work (PLAN.md §9 "Imports & exports"), so this is one flow, not two.
 *
 * The .ics fixture is built in-memory rather than read from disk — the parser
 * itself already has thorough unit coverage in tests/calendar/ics-parse.test.ts;
 * this only needs one real event to exercise the review screen and the write.
 */
function icsFixture(start: Date, end: Date): string {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//E2E//Import Test//EN",
    "BEGIN:VEVENT",
    "UID:e2e-import-1@example.com",
    "SUMMARY:E2E Import Lecture",
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

test("importing an .ics file reaches the calendar, and exporting downloads a real file", async ({
  page,
}) => {
  await registerAndCompleteOnboarding(page);

  // Today, not some future date: the calendar opens on the current week by
  // default, and this way the test doesn't need to navigate it to find the
  // imported event.
  const start = new Date(Date.now() + 2 * 3_600_000);
  const end = new Date(start.getTime() + 2 * 3_600_000);

  await page.goto("/import-export");

  // Nothing is saved until the review screen's own confirm — the file picker
  // only produces a preview (PLAN.md §"Session 9 decisions").
  await page.getByLabel("Upload a file").setInputFiles({
    name: "e2e-import.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(icsFixture(start, end)),
  });

  await expect(page.getByText("E2E Import Lecture")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Import 1 event" }).click();

  await expect(page.getByText("Imported", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Open the calendar" }).click();
  await page.waitForURL(/\/calendar/);

  // Month view, not the default week view: registration saves the browser's
  // own detected time zone (register-form.tsx), so "two hours from now" can
  // land on the next local calendar day depending on where this runs. Either
  // day is still the same month.
  await page.getByRole("button", { name: "Month" }).click();
  await expect(page.getByText("E2E Import Lecture")).toBeVisible({ timeout: 15_000 });

  // Export: a plain downloadable link, no JavaScript fetch involved
  // (PLAN.md §"Session 9 decisions" point 7).
  await page.goto("/import-export");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Calendar file (.ics)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
});
