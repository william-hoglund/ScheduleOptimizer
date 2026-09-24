import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy — limits where the page may load code and send data,
 * so an injected script cannot quietly ship a student's data somewhere else.
 *
 * `connect-src` is the important line: it allows Supabase (REST, auth and
 * realtime) and nothing else. Google Calendar is added in Session 10, and it
 * talks to us server-side anyway.
 *
 * `'unsafe-inline'` on scripts is required because Next.js injects inline
 * bootstrap scripts. Removing it means generating a per-request nonce in
 * proxy.ts — worth doing before launch, tracked for Session 11.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .join("; ")
  .concat(isDev ? "" : "; upgrade-insecure-requests");

const nextConfig: NextConfig = {
  typedRoutes: true,

  // The old prototype at ../ has its own package-lock.json, which makes Next
  // guess the wrong workspace root. Pin it to this directory.
  turbopack: {
    root: import.meta.dirname,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
