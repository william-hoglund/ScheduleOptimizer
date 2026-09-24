// Design palette source of truth.
//
// Colours are authored here in HSL (easy to reason about), converted to OKLCH
// for src/app/globals.css, and every text/background pair the product actually
// uses is checked against WCAG AA (4.5:1).
//
//   npm run check:contrast
//
// Exits non-zero if any pair fails, so CI catches an inaccessible colour before
// it ships. If you change a value in globals.css, change it here too.

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToOklch([r, g, b]) {
  const lr = srgbToLinear(r),
    lg = srgbToLinear(g),
    lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

function relLuminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map(srgbToLinear);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(rgb1, rgb2) {
  const l1 = relLuminance(rgb1),
    l2 = relLuminance(rgb2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const fmt = ([L, C, H]) => `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(2)})`;

// --- palette (HSL as designed) ---
const light = {
  background: [40, 20, 98],
  card: [0, 0, 100],
  foreground: [222, 25, 15],
  "muted-foreground": [220, 10, 42],
  muted: [220, 20.5, 96],
  primary: [245, 45, 52],
  success: [150, 42, 33],
  warning: [35, 85, 33],
  destructive: [0, 62, 47],
  border: [220, 13, 90],
  "event-lecture": [212, 58, 45],
  "event-study": [265, 48, 54],
  "event-deadline": [25, 85, 37],
  "event-exam": [0, 62, 47],
  "event-break": [175, 45, 32],
  "event-personal": [220, 10, 45],
};

const dark = {
  background: [225, 15, 9],
  card: [225, 14, 13],
  foreground: [220, 15, 95],
  "muted-foreground": [220, 10, 65],
  muted: [225, 11.5, 16.75],
  primary: [245, 70, 72],
  success: [150, 45, 62],
  warning: [38, 85, 62],
  destructive: [0, 70, 65],
  border: [225, 12, 22],
  "event-lecture": [212, 65, 65],
  "event-study": [265, 60, 72],
  "event-deadline": [25, 82, 62],
  "event-exam": [0, 70, 65],
  "event-break": [175, 50, 55],
  "event-personal": [220, 10, 62],
};

for (const [name, set] of [
  ["LIGHT", light],
  ["DARK", dark],
]) {
  console.log(`\n/* ---------- ${name} ---------- */`);
  for (const [key, hsl] of Object.entries(set)) {
    console.log(`  --${key}: ${fmt(rgbToOklch(hslToRgb(...hsl)))};`);
  }
}

console.log("\n\n=== WCAG contrast check ===");
function check(label, fg, bg, min) {
  const ratio = contrast(hslToRgb(...fg), hslToRgb(...bg));
  const pass = ratio >= min;
  console.log(`${pass ? "PASS" : "FAIL"}  ${ratio.toFixed(2)}:1  (need ${min})  ${label}`);
  return pass;
}

let ok = true;
console.log("\n-- Light mode --");
ok &= check("foreground on background", light.foreground, light.background, 4.5);
ok &= check("foreground on card", light.foreground, light.card, 4.5);
ok &= check("muted-foreground on background", light["muted-foreground"], light.background, 4.5);
ok &= check("muted-foreground on card", light["muted-foreground"], light.card, 4.5);
// Inactive tab labels sit on --muted. shadcn's default (foreground at 60%)
// failed here at 4.13:1; see components/ui/tabs.tsx.
ok &= check("muted-foreground on muted", light["muted-foreground"], light.muted, 4.5);
ok &= check("primary on background", light.primary, light.background, 4.5);
ok &= check("white on primary (button)", [0, 0, 100], light.primary, 4.5);
ok &= check("white on destructive", [0, 0, 100], light.destructive, 4.5);
ok &= check("white on success", [0, 0, 100], light.success, 4.5);
ok &= check("white on warning", [0, 0, 100], light.warning, 4.5);
ok &= check("success text on background", light.success, light.background, 4.5);
ok &= check("warning text on background", light.warning, light.background, 4.5);
ok &= check("destructive text on background", light.destructive, light.background, 4.5);
for (const k of [
  "event-lecture",
  "event-study",
  "event-deadline",
  "event-exam",
  "event-break",
  "event-personal",
]) {
  ok &= check(`white on ${k}`, [0, 0, 100], light[k], 4.5);
  ok &= check(`${k} text on background`, light[k], light.background, 4.5);
}

console.log("\n-- Dark mode --");
ok &= check("foreground on background", dark.foreground, dark.background, 4.5);
ok &= check("foreground on card", dark.foreground, dark.card, 4.5);
ok &= check("muted-foreground on background", dark["muted-foreground"], dark.background, 4.5);
ok &= check("muted-foreground on card", dark["muted-foreground"], dark.card, 4.5);
ok &= check("muted-foreground on muted", dark["muted-foreground"], dark.muted, 4.5);
ok &= check("primary on background", dark.primary, dark.background, 4.5);
for (const k of [
  "event-lecture",
  "event-study",
  "event-deadline",
  "event-exam",
  "event-break",
  "event-personal",
]) {
  ok &= check(`${k} text on card`, dark[k], dark.card, 4.5);
}

if (ok) {
  console.log("\nAll pairs pass WCAG AA (4.5:1).");
} else {
  console.error("\nSome pairs FAIL WCAG AA — adjust before shipping.");
  process.exit(1);
}
