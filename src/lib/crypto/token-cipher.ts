import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getServerEnv } from "@/lib/env";

/**
 * AES-256-GCM for OAuth tokens at rest.
 *
 * No `server-only` guard: like the rest of `lib/`, this is pure (a string in,
 * a string out, no request context) and unit-tested directly — see
 * tests/crypto/token-cipher.test.ts. It still can't run in the browser in
 * practice: `node:crypto` has no client bundle, and every real caller lives
 * in `src/server/`.
 *
 * `calendar_connections` holds Google refresh tokens, and the table's own RLS
 * denies every client read entirely (see supabase/migrations/0003_calendar.sql)
 * — but a database dump is a second, independent risk the encryption defends
 * against on its own. The key never touches the client; it is read from
 * `ENCRYPTION_KEY` here, in the one module that does the encrypting.
 *
 * Each call generates a fresh random IV — reusing one with GCM breaks its
 * confidentiality guarantee outright, not just weakens it. The IV and auth tag
 * are not secret, so they travel alongside the ciphertext in one encoded
 * string rather than needing a second column.
 */

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function keyBuffer(): Buffer {
  const { ENCRYPTION_KEY } = getServerEnv();
  if (!ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.local.",
    );
  }

  const key = Buffer.from(ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        "Generate one with `openssl rand -base64 32`.",
    );
  }

  return key;
}

/** iv (12) + authTag (16) + ciphertext, base64-encoded as one opaque string. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptToken(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  if (raw.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("Malformed encrypted token: too short to contain an IV and auth tag.");
  }

  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + AUTH_TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", keyBuffer(), iv);
  decipher.setAuthTag(authTag);

  // A wrong key or tampered ciphertext throws here — GCM verifies integrity
  // before handing back any plaintext, so there is no silent corruption case.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
