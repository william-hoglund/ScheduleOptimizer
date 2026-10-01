import { z } from "zod";

/**
 * Validated environment variables.
 *
 * The point is to fail loudly at startup with a readable message, rather than
 * halfway through a request with "undefined is not a valid URL".
 *
 * Two separate schemas, because the boundary matters:
 *
 *   clientEnv — only NEXT_PUBLIC_* variables. Next.js inlines these into the
 *               browser bundle, so anything here is public. Never put a secret
 *               in a NEXT_PUBLIC_ variable.
 *   serverEnv — everything else. Only readable in Server Components, Server
 *               Actions, Route Handlers and scripts.
 *
 * Note the explicit `process.env.NAME` references below. Next.js replaces those
 * literally at build time, so `process.env[someVariable]` would not work.
 *
 * Each session adds the variables it needs. Session 1 only needs the app URL;
 * Supabase arrives in Session 2, AI in Session 8.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url({
    message: "NEXT_PUBLIC_APP_URL must be a full URL, e.g. http://localhost:3000",
  }),
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    message: "NEXT_PUBLIC_SUPABASE_URL must be your project URL, e.g. https://abc.supabase.co",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Copy it from Supabase → Settings → API."),
});

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Optional until Session 7. Only the handful of jobs that must bypass Row
  // Level Security need it, and they check for it explicitly.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),

  // AI layer (Session 10). Both keys are optional — the product works with AI
  // disabled — but whichever one AI_PROVIDER points at must be present for a
  // feature to turn itself on. See lib/ai/index.ts#isAiEnabled.
  AI_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  OPENAI_API_KEY: z.string().min(20).optional(),
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  // Pinned to a dated snapshot rather than a moving alias, so a model upgrade
  // is a deliberate env change, not a silent behaviour shift the next time the
  // provider promotes a new default. Bump these whenever you want the newer
  // model — nothing else in the code needs to change.
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-2024-08-06"),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),

  // Notification dispatch (Session 24). Optional — the route refuses every
  // request until this is set, which is the correct failure mode for a
  // deployment that hasn't wired up the cron yet.
  CRON_SECRET: z.string().min(16).optional(),

  // Google Calendar sync (Session 27). All optional — the feature hides
  // itself when any is missing, the same pattern as AI. See
  // lib/google/calendar-client.ts#isGoogleCalendarEnabled.
  GOOGLE_CLIENT_ID: z.string().min(10).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(10).optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  // AES-256-GCM key for refresh/access tokens at rest, base64-encoded, exactly
  // 32 bytes decoded. Generate with `openssl rand -base64 32`.
  ENCRYPTION_KEY: z.string().min(40).optional(),
});

function parse<T extends z.ZodType>(schema: T, values: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(values);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid ${label} environment variables:\n${issues}\n\n` +
        `Copy .env.example to .env.local and fill in the missing values.`,
    );
  }

  return result.data;
}

export const clientEnv = parse(
  clientSchema,
  {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  "client",
);

/**
 * Server-only. Importing this from a Client Component is a build error, which
 * is the safety net that stops a secret reaching the browser by accident.
 */
export function getServerEnv() {
  return parse(
    serverSchema,
    {
      NODE_ENV: process.env.NODE_ENV,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
      AI_PROVIDER: process.env.AI_PROVIDER || undefined,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
      OPENAI_MODEL: process.env.OPENAI_MODEL || undefined,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || undefined,
      CRON_SECRET: process.env.CRON_SECRET || undefined,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || undefined,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || undefined,
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || undefined,
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || undefined,
    },
    "server",
  );
}
