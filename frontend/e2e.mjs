// Browser check of the built app against a running server in demo mode:
//   LARIS_DEMO_MODE=1 uvicorn laris_api.main:app --port 8000 &   (cd frontend && node e2e.mjs http://localhost:8000 shots)
// Opens every page at phone and desktop size, records sales, buys stock, and fails on any
// page error, console error or failed API call.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:8000";
const out = process.argv[3] ?? "shots";
mkdirSync(out, { recursive: true });
const problems = [];
const pages = {
  beranda: "Omzet harian", catat: "Catat penjualan", stok: "Stok bahan", prediksi: "Prediksi 4 minggu",
  belanja: "Daftar belanja", menu: "Menu & resep", pengaturan: "Pengaturan",
};

const browser = await chromium.launch();
for (const [label, opts] of [["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
                             ["desktop", { viewport: { width: 1360, height: 900 } }]]) {
  const page = await (await browser.newContext(opts)).newPage();
  page.on("pageerror", (e) => problems.push(`${label}: page error ${e}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`${label}: console ${m.text()}`));
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 400 && problems.push(`${label}: ${r.status()} ${r.url()}`));
  for (const [path, text] of Object.entries(pages)) {
    await page.goto(`${base}/#/${path}`);
    try {
      await page.getByRole("heading", { name: text }).first().waitFor({ timeout: 15000 });
    } catch {
      problems.push(`${label}: "${text}" not shown on #/${path}`);
    }
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`${label}: #/${path} scrolls sideways by ${overflow}px`);
    await page.screenshot({ path: `${out}/${label}-${path}.png`, fullPage: true });
  }
  if (label === "desktop") {
    // record a sale: +1 on the first item, save, and see the confirmation
    await page.goto(`${base}/#/catat`);
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Simpan" }).click();
    await page.getByText("Tersimpan", { exact: false }).waitFor({ timeout: 10000 }).catch(() => problems.push("saving sales showed no confirmation"));
    // buy the first item on the shopping list
    await page.goto(`${base}/#/belanja`);
    const buy = page.getByRole("button", { name: "Sudah dibeli" }).first();
    if (await buy.count()) {
      await buy.click();
      await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
      await page.getByText("dicatat", { exact: false }).waitFor({ timeout: 10000 }).catch(() => problems.push("buying showed no confirmation"));
    }
  }
}
await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("e2e ok");
