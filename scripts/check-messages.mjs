// Verifies that every locale defines exactly the same set of translation keys.
//
//   npm run check:messages
//
// Type checking only validates keys against English, so without this a Swedish
// translation could silently go missing and fall back to a raw key on screen.

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const messagesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n", "messages");

function flatten(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flatten(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const files = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
if (files.length < 2) {
  console.log(`Only ${files.length} locale file(s) — nothing to compare.`);
  process.exit(0);
}

const byLocale = new Map();
for (const file of files) {
  const locale = file.replace(/\.json$/, "");
  const parsed = JSON.parse(readFileSync(join(messagesDir, file), "utf8"));
  byLocale.set(locale, new Set(flatten(parsed)));
}

const reference = "en";
const referenceKeys = byLocale.get(reference);
if (!referenceKeys) {
  console.error(`Missing reference locale "${reference}.json".`);
  process.exit(1);
}

let failed = false;
for (const [locale, keys] of byLocale) {
  if (locale === reference) continue;

  const missing = [...referenceKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !referenceKeys.has(k));

  if (missing.length === 0 && extra.length === 0) {
    console.log(`${locale}: ${keys.size} keys, matches ${reference}.`);
    continue;
  }

  failed = true;
  if (missing.length) {
    console.error(`\n${locale} is MISSING ${missing.length} key(s) present in ${reference}:`);
    for (const k of missing) console.error(`  - ${k}`);
  }
  if (extra.length) {
    console.error(`\n${locale} has ${extra.length} key(s) not in ${reference}:`);
    for (const k of extra) console.error(`  + ${k}`);
  }
}

if (failed) {
  console.error("\nTranslation files are out of sync.");
  process.exit(1);
}
console.log("\nAll locales in sync.");
