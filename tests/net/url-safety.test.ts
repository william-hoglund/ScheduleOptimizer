import { describe, expect, it } from "vitest";

import { checkPublicHttpUrl, isPrivateAddress } from "@/lib/net/url-safety";

/**
 * These are a security control, not a convenience. An untested guard against
 * server-side request forgery is a wish, so every range that must be refused is
 * asserted here rather than assumed from reading the list.
 */

describe("isPrivateAddress", () => {
  it("refuses the ranges a public calendar feed never lives in", () => {
    const blocked = [
      "127.0.0.1",
      "0.0.0.0",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata — the one that matters most
      "100.64.0.1",
      "224.0.0.1",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ];

    for (const address of blocked) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const address of ["8.8.8.8", "172.32.0.1", "192.167.1.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("is not fooled by a hostname that merely looks numeric", () => {
    expect(isPrivateAddress("cloud.timeedit.net")).toBe(false);
    expect(isPrivateAddress("10.1.2")).toBe(false);
  });
});

describe("checkPublicHttpUrl", () => {
  it("accepts a normal https feed", () => {
    const result = checkPublicHttpUrl("https://cloud.timeedit.net/liu/web/schema.ics");
    expect(result.ok).toBe(true);
  });

  it("rewrites webcal:// to https, which is what it means", () => {
    const result = checkPublicHttpUrl("webcal://cloud.timeedit.net/schema.ics");
    expect(result.ok && result.url.protocol).toBe("https:");
  });

  it("refuses schemes that are not the web", () => {
    for (const raw of ["file:///etc/passwd", "ftp://example.com/a.ics", "not a url"]) {
      expect(checkPublicHttpUrl(raw), raw).toMatchObject({ ok: false, reason: "scheme" });
    }
  });

  it("refuses credentials in the URL", () => {
    expect(checkPublicHttpUrl("https://user:pass@example.com/a.ics")).toMatchObject({
      ok: false,
      reason: "credentials",
    });
  });

  it("refuses anything pointing back at this machine or its network", () => {
    for (const raw of [
      "http://localhost:54321/rest/v1/profiles",
      "http://127.0.0.1/a.ics",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/a.ics",
      "http://printer.local/a.ics",
    ]) {
      expect(checkPublicHttpUrl(raw), raw).toMatchObject({ ok: false, reason: "privateHost" });
    }
  });
});
