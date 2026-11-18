// Fails when a t("...") text in src/ has no English entry in src/i18n/en.ts.
// Usage: node scripts/check-i18n.mjs [--list]   (--list prints every missing text)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not URL.pathname: on Windows the pathname is "/D:/..." and breaks join()
const root = fileURLToPath(new URL("../src/", import.meta.url));
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); });
walk(root);

// texts passed through t() from data tables rather than as literals
const tables = [/(?:label|short|hint|group): "((?:[^"\\]|\\.)*)"/g];
const keys = new Set();
for (const f of files) {
  if (f.endsWith("en.ts")) continue;
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  if (/App\.tsx$|Beranda\.tsx$|Stok\.tsx$/.test(f)) for (const re of tables) for (const m of src.matchAll(re)) keys.add(JSON.parse(`"${m[1]}"`));
}
const en = readFileSync(join(root, "i18n/en.ts"), "utf8");
const have = new Set([...en.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) => JSON.parse(`"${m[1]}"`)));
const missing = [...keys].filter((k) => !have.has(k)).sort();
if (process.argv.includes("--list")) { console.log(JSON.stringify(missing, null, 1)); process.exit(0); }
if (missing.length) { console.error(`${missing.length} texts have no English translation:\n` + missing.map((k) => `  ${k}`).join("\n")); process.exit(1); }
console.log(`i18n ok: ${keys.size} texts translated`);
