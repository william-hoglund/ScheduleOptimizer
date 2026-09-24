/**
 * Guards for URLs the *student* supplies and the *server* then fetches.
 *
 * Subscribing to a timetable by URL means our server makes a request to an
 * address someone else chose. That is server-side request forgery waiting to
 * happen: `http://169.254.169.254/` is the cloud metadata service, and
 * `http://localhost:54321/` is Supabase. Neither is reachable from a browser,
 * but both are reachable from the machine running this code.
 *
 * Two layers, because either alone is bypassable:
 *  1. these syntax checks, and
 *  2. resolving the hostname and checking every address it points at, which is
 *     what stops `evil.example` from simply having an A record of 127.0.0.1.
 *
 * Pure. The DNS half lives in `src/server/ics-fetch.ts`.
 */

export type UrlRejection = "scheme" | "credentials" | "privateHost";

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: UrlRejection };

/** Hostnames that never belong to a public calendar service. */
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost"]);

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa"];

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** [first address, prefix length] of the ranges no public feed lives in. */
const BLOCKED_V4_RANGES: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

export function isPrivateAddress(address: string): boolean {
  const plain = address.trim().toLowerCase().replace(/^\[|\]$/g, "");

  const asV4 = ipv4ToNumber(plain);
  if (asV4 !== null) {
    return BLOCKED_V4_RANGES.some(([base, bits]) => {
      const start = ipv4ToNumber(base);
      if (start === null) return false;
      const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
      return (asV4 & mask) >>> 0 === (start & mask) >>> 0;
    });
  }

  if (!plain.includes(":")) return false;

  // An IPv6 address that merely wraps an IPv4 one ("::ffff:127.0.0.1") must be
  // judged by the address inside it.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(plain);
  if (mapped?.[1]) return isPrivateAddress(mapped[1]);

  if (plain === "::1" || plain === "::") return true;

  const head = plain.split(":")[0] ?? "";
  if (/^f[cd][0-9a-f]{2}$/.test(head)) return true; // unique local, fc00::/7
  if (/^fe[89ab][0-9a-f]$/.test(head)) return true; // link-local, fe80::/10

  return false;
}

/**
 * Syntax-level acceptance. `webcal://` — what a university's "subscribe" button
 * hands out — is rewritten to https, which is the same server over the same
 * transport.
 */
export function checkPublicHttpUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    return { ok: false, reason: "scheme" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "scheme" };
  }

  // Credentials in a URL would be forwarded to whatever it redirects to.
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "credentials" };
  }

  const host = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "privateHost" };
  }

  if (isPrivateAddress(host)) {
    return { ok: false, reason: "privateHost" };
  }

  return { ok: true, url };
}
