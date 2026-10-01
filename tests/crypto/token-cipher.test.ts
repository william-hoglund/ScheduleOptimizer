import { beforeAll, describe, expect, it } from "vitest";

/**
 * AES-256-GCM for OAuth tokens at rest.
 *
 * Every env var here is set in-process rather than read from `.env.local` —
 * a unit test must not depend on a developer's local secrets file to pass.
 * `NEXT_PUBLIC_SUPABASE_*` are only present because `lib/env.ts` validates
 * its whole client schema eagerly at module load, before this file's own
 * `ENCRYPTION_KEY` is ever read; this is the first test to import anything
 * that pulls `lib/env.ts` in, which is why no other test needed this.
 */

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key-at-least-20-characters";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("encryptToken / decryptToken", () => {
  it("round-trips a token", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto/token-cipher");

    const encrypted = encryptToken("ya29.a0ExampleRefreshToken");
    expect(encrypted).not.toContain("ya29");
    expect(decryptToken(encrypted)).toBe("ya29.a0ExampleRefreshToken");
  });

  it("produces a different ciphertext each time (fresh IV)", async () => {
    const { encryptToken } = await import("@/lib/crypto/token-cipher");

    const first = encryptToken("same-plaintext");
    const second = encryptToken("same-plaintext");
    expect(first).not.toBe(second);
  });

  it("refuses to decrypt a tampered ciphertext", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto/token-cipher");

    const encrypted = encryptToken("a-real-token");
    const raw = Buffer.from(encrypted, "base64");
    // Flip a byte well past the IV and auth tag, inside the ciphertext itself.
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0xff;
    const tampered = raw.toString("base64");

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("throws rather than silently decrypting with the wrong key", async () => {
    const { encryptToken, decryptToken } = await import("@/lib/crypto/token-cipher");

    const encrypted = encryptToken("a-real-token");
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    try {
      expect(() => decryptToken(encrypted)).toThrow();
    } finally {
      process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    }
  });

  it("rejects a key that doesn't decode to 32 bytes", async () => {
    const { encryptToken } = await import("@/lib/crypto/token-cipher");

    // 40 bytes, not 32 — long enough to clear lib/env.ts's own `.min(40)`
    // string-length check, so it's this module's own decode-length check
    // being exercised, not the env schema's.
    process.env.ENCRYPTION_KEY = Buffer.alloc(40, 1).toString("base64");
    try {
      expect(() => encryptToken("anything")).toThrow(/32 bytes/);
    } finally {
      process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    }
  });
});
