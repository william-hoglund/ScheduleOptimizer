/**
 * Finding the subscribable calendar inside a timetable web page.
 *
 * The one piece of the old prototype worth keeping outright. Swedish
 * universities publish schedules through TimeEdit, and what a student is given
 * — in an email, on a course page — is a link to an HTML page. The `.ics` that
 * a calendar app can actually subscribe to is a link *inside* that page.
 *
 * A student who pastes the URL they were given should get their schedule, not
 * "that is not a calendar". So when a fetch comes back as HTML, this looks for
 * the real feed.
 *
 * Pure, so the markup variants different universities emit can be pinned as
 * fixtures. The fetching, and the checks that go with fetching a URL someone
 * else chose, live in `src/server/ics-fetch.ts`.
 */

/**
 * Deliberately broad: the surrounding markup differs between universities and
 * changes without notice. The only dependable constants are that the link ends
 * in `.ics` and is served over `webcal:` or `http(s):`.
 */
const ICS_LINK = /(?:href|src)\s*=\s*["'](webcal:\/\/|https?:\/\/|\/)[^"']*?\.ics[^"']*/i;

export function findIcsLinkInHtml(html: string, baseUrl: string): string | null {
  const match = ICS_LINK.exec(html);
  if (!match) return null;

  const raw = match[0].replace(/^(?:href|src)\s*=\s*["']/i, "").trim();

  try {
    // webcal is https in a costume: same server, same transport, a scheme that
    // exists only to make the operating system open a calendar app.
    return new URL(raw.replace(/^webcal:\/\//i, "https://"), baseUrl).toString();
  } catch {
    return null;
  }
}
