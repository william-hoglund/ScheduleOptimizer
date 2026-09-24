// Concatenates supabase/migrations/*.sql into a single file that can be pasted
// into the Supabase SQL Editor in one go.
//
//   npm run db:bundle
//
// The numbered files stay the source of truth; this is only a convenience for
// applying them without the Supabase CLI installed.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase");
const migrationsDir = join(root, "migrations");
const outFile = join(root, "APPLY_ALL.sql");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const header = `-- =============================================================
-- AI Study Planner — complete schema
--
-- GENERATED FILE. Do not edit; edit supabase/migrations/*.sql and
-- re-run \`npm run db:bundle\`.
--
-- To apply: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run.
--
-- Safe to run once on an empty project. Running it twice will error on
-- "already exists", which is intentional: it stops a second run from
-- silently doing half a job.
--
-- Files included: ${files.length}
-- Generated:      ${new Date().toISOString()}
-- =============================================================

`;

const body = files
  .map((file) => {
    const sql = readFileSync(join(migrationsDir, file), "utf8").trimEnd();
    return `\n-- <<<<<<<<<<<<<<<< ${file} >>>>>>>>>>>>>>>>\n\n${sql}\n`;
  })
  .join("\n");

writeFileSync(outFile, header + body + "\n");

console.log(`Bundled ${files.length} migration(s) into supabase/APPLY_ALL.sql`);
for (const f of files) console.log(`  - ${f}`);
