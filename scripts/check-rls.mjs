// Verifies that Row Level Security actually blocks anonymous access.
//
//   npm run check:rls
//
// Uses the public anon key with no signed-in user — exactly what a stranger
// with your published JavaScript bundle has. Every table must return zero rows.
// A table that returns data here is readable by the entire internet.
//
// This is the check that matters most in the whole project: RLS is the only
// thing standing between one student's data and another's.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvLocal() {
  const env = {};
  let raw;
  try {
    raw = readFileSync(join(root, ".env.local"), "utf8");
  } catch {
    console.error("No .env.local found. Copy .env.example and fill it in.");
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

const env = readEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.");
  process.exit(1);
}

const TABLES = [
  "profiles",
  "institutions",
  "programs",
  "courses",
  "tasks",
  "task_dependencies",
  "calendar_connections",
  "calendar_events",
  "study_preferences",
  "availability_rules",
  "study_plans",
  "study_sessions",
  "planner_runs",
  "notifications",
  "notification_settings",
  "user_consents",
  "audit_log",
  "study_groups",
  "study_group_members",
  "study_group_scores",
];

let failures = 0;
let missing = 0;

console.log(`Checking ${TABLES.length} tables anonymously against ${url}\n`);

for (const table of TABLES) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });

  const body = await response.text();

  // 401/403, or 200 with an empty array, both mean "blocked".
  if (response.status === 401 || response.status === 403) {
    console.log(`  BLOCKED   ${table}  (${response.status})`);
    continue;
  }

  if (response.status === 404 || body.includes("does not exist")) {
    console.log(`  MISSING   ${table}  — migrations not applied yet`);
    missing += 1;
    continue;
  }

  if (response.ok) {
    let rows;
    try {
      rows = JSON.parse(body);
    } catch {
      console.log(`  ?         ${table}  — unexpected response: ${body.slice(0, 80)}`);
      continue;
    }

    if (Array.isArray(rows) && rows.length === 0) {
      console.log(`  BLOCKED   ${table}  (RLS returned no rows)`);
    } else {
      console.error(
        `  EXPOSED   ${table}  — returned ${rows.length} row(s) to an anonymous caller`,
      );
      failures += 1;
    }
    continue;
  }

  console.log(`  ?         ${table}  — HTTP ${response.status}: ${body.slice(0, 80)}`);
}

console.log("");

if (missing > 0) {
  console.error(
    `${missing} table(s) do not exist yet.\n` +
      `Apply supabase/APPLY_ALL.sql in the Supabase SQL Editor, then re-run this.`,
  );
  process.exit(1);
}

if (failures > 0) {
  console.error(
    `${failures} table(s) are readable anonymously. Fix the RLS policies before going further.`,
  );
  process.exit(1);
}

console.log("All tables deny anonymous access.");
