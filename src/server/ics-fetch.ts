import "server-only";

import { lookup } from "node:dns/promises";

import { findIcsLinkInHtml } from "@/lib/calendar/timeedit";
import { checkPublicHttpUrl, isPrivateAddress } from "@/lib/net/url-safety";

/**
 * Fetching a timetable from a URL the student pasted.
 *
 * This is the only place in the app where our server makes a request to an
 * address someone else chose, so it is deliberately paranoid:
 *
 *  - the URL must survive `checkPublicHttpUrl` (scheme, credentials, literal
 *    private addresses),
 *  - **every** address its hostname resolves to is checked, because a public
 *    hostname may point at 127.0.0.1,
 *  - redirects are followed by hand, re-running both checks on each hop — a
 *    single `redirect: "follow"` would let hop two go anywhere,
 *  - the response is read incrementally and abandoned past a size cap, so a
 *    multi-gigabyte body cannot exhaust the server's memory,
 *  - there is a request timeout.
 *
 * TimeEdit is handled here too, and that part is domain knowledge rather than
 * paranoia: Swedish universities hand out a link to an HTML page, and the
 * subscribable `.ics` is a link inside it. Students paste the page URL, because
 * that is the one they were given.
 */

export type IcsFetchError =
  | "invalidUrl"
  | "privateAddress"
  | "unreachable"
  | "tooLarge"
  | "notCalendar";

export type IcsFetchResult =
  | { ok: true; text: string; sourceUrl: string }
  | { ok: false; error: IcsFetchError };

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

const USER_AGENT = "AIStudyPlanner/1.0 (+calendar import)";

/** Every address the hostname resolves to must be public, not just the first. */
async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  // A literal address needs no lookup, and `lookup()` would happily echo it back.
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    return !isPrivateAddress(hostname);
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((entry) => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

async function readCapped(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return null;

  const body = response.body;
  if (!body) return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8").decode(merged);
}

type FetchedBody = { text: string; finalUrl: string; contentType: string };

async function fetchWithGuards(
  rawUrl: string,
): Promise<{ ok: true; body: FetchedBody } | { ok: false; error: IcsFetchError }> {
  let target = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const check = checkPublicHttpUrl(target);
    if (!check.ok) {
      return { ok: false, error: check.reason === "privateHost" ? "privateAddress" : "invalidUrl" };
    }

    if (!(await resolvesToPublicAddress(check.url.hostname))) {
      return { ok: false, error: "privateAddress" };
    }

    let response: Response;
    try {
      response = await fetch(check.url, {
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/calendar, text/html;q=0.8, */*;q=0.5" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      return { ok: false, error: "unreachable" };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, error: "unreachable" };
      target = new URL(location, check.url).toString();
      continue;
    }

    if (!response.ok) return { ok: false, error: "unreachable" };

    const text = await readCapped(response);
    if (text === null) return { ok: false, error: "tooLarge" };

    return {
      ok: true,
      body: {
        text,
        finalUrl: check.url.toString(),
        contentType: response.headers.get("content-type") ?? "",
      },
    };
  }

  return { ok: false, error: "unreachable" };
}

function looksLikeCalendar(text: string): boolean {
  return text.includes("BEGIN:VCALENDAR");
}

export async function fetchIcsFromUrl(rawUrl: string): Promise<IcsFetchResult> {
  const first = await fetchWithGuards(rawUrl);
  if (!first.ok) return first;

  if (looksLikeCalendar(first.body.text)) {
    return { ok: true, text: first.body.text, sourceUrl: first.body.finalUrl };
  }

  const isHtml =
    first.body.contentType.includes("html") || /<html|<!doctype html/i.test(first.body.text);
  if (!isHtml) return { ok: false, error: "notCalendar" };

  const link = findIcsLinkInHtml(first.body.text, first.body.finalUrl);
  if (!link) return { ok: false, error: "notCalendar" };

  // The link came from a page we do not control, so it goes through exactly the
  // same guards as anything the student typed.
  const second = await fetchWithGuards(link);
  if (!second.ok) return second;

  if (!looksLikeCalendar(second.body.text)) return { ok: false, error: "notCalendar" };

  return { ok: true, text: second.body.text, sourceUrl: second.body.finalUrl };
}
