// Browser check of the built app against a running server:
//   uvicorn laris_api.main:app --port 8000 &   (cd frontend && node e2e.mjs http://localhost:8000 shots)
// On a fresh shop it signs up through the whole wizard (with sample data). Then it opens every page
// on a phone in light mode, on a desktop in dark mode, and on a desktop in English; it records a sale,
// buys stock, records and deletes an expense, runs a what-if, and switches theme and language.
// It fails on page errors, console errors, failed API calls, missing English texts and sideways scrolling.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:8000";
const out = process.argv[3] ?? "shots";
const password = "rahasia123";
mkdirSync(out, { recursive: true });
const problems = [];

// page -> heading text in Indonesian and English
const pages = {
  beranda: ["Berapa yang benar-benar jadi untung?", "How much is real profit?"],
  catat: ["Catat penjualan", "Record sales"],
  stok: ["Stok bahan", "Ingredient stock"],
  belanja: ["Daftar belanja", "Shopping list"],
  pengeluaran: ["Pengeluaran", "Expenses"],
  ringkasan: ["Ringkasan minggu", "Weekly summary"],
  prediksi: ["Prediksi 4 minggu", "4-week forecast"],
  simulasi: ["Coba hitung: kalau…", "What if…"],
  menu: ["Menu & resep", "Menu & recipes"],
  pengaturan: ["Pengaturan", "Settings"],
  lainnya: ["Lainnya", "More"],
};

const browser = await chromium.launch();

async function open(label, opts, lang, theme = "light") {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(([l, th]) => {
    try { localStorage.setItem("laris-lang", l); if (!sessionStorage.getItem("set")) { localStorage.setItem("laris-theme", th); sessionStorage.setItem("set", "1"); } } catch { /* ignore */ }
  }, [lang, theme]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${label}: page error ${e}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`${label}: console ${m.text()}`);
    if (m.text().includes("[i18n] missing")) problems.push(`${label}: ${m.text()}`);
  });
  page.on("response", (r) => r.url().includes("/api/") && r.status() >= 400
    && problems.push(`${label}: ${r.status()} ${r.url()}`));
  page.on("dialog", (d) => d.accept());
  await page.goto(base);
  await page.waitForSelector("main#main, #pw, #shop");
  return page;
}

async function signUp(page) {
  await page.fill("#shop", "Warung Uji Laba");
  await page.fill("#owner", "Pak Uji");
  await page.getByRole("button", { name: /Kafe/ }).click();
  await page.fill("#city", "Solo");
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("button", { name: "Minggu", exact: true }).click();   // closed on Sundays
  await page.getByRole("button", { name: "2 hari sekali" }).click();
  await page.fill("#target", "60000000");
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("radio", { name: /Pilih menu dari contoh/ }).click();
  if (await page.getByRole("button", { name: "Lanjut" }).isEnabled()) problems.push("sign-up: continued without picking a menu");
  await page.getByRole("radio", { name: /Coba dengan data contoh/ }).click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.fill("#pw", password);
  await page.fill("#pw2", "different");
  if (await page.getByRole("button", { name: "Buat akun" }).isEnabled()) problems.push("sign-up: allowed mismatched passwords");
  await page.fill("#pw2", password);
  await page.getByRole("button", { name: "Buat akun" }).click();
  await page.waitForSelector("main#main", { timeout: 60000 });
}

async function signIn(page) {
  if (await page.locator("#shop").count()) await signUp(page);
  else if (await page.locator("#pw").count()) {
    await page.fill("#pw", password);
    await page.keyboard.press("Enter");
    await page.waitForSelector("main#main");
  }
}

async function tour(page, label, li) {
  for (const [path, names] of Object.entries(pages)) {
    await page.goto(`${base}/#/${path}`);
    try {
      await page.getByRole("heading", { name: names[li], exact: true }).first().waitFor({ timeout: 20000 });
    } catch {
      problems.push(`${label}: "${names[li]}" not shown on #/${path}`);
    }
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`${label}: #/${path} scrolls sideways by ${overflow}px`);
    await page.screenshot({ path: `${out}/${label}-${path}.png`, fullPage: true });
  }
}

const expect = (ok, msg) => { if (!ok) problems.push(msg); };

// 1. phone, light, Indonesian: sign up, then every page
{
  const page = await open("phone-light", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, "id");
  await signIn(page);
  await tour(page, "phone-light", 0);
  await page.close();
}

// 2. desktop, dark, Indonesian: every page plus the actions
{
  const page = await open("desktop-dark", { viewport: { width: 1360, height: 900 } }, "id", "dark");
  expect(await page.evaluate(() => document.documentElement.dataset.theme) === "dark", "dark theme not applied");
  await signIn(page);
  await tour(page, "desktop-dark", 0);

  await page.goto(`${base}/#/catat`);
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.getByText("Tersimpan", { exact: false }).waitFor({ timeout: 10000 }).catch(() => problems.push("saving sales showed no confirmation"));

  await page.goto(`${base}/#/belanja`);
  const buy = page.getByRole("button", { name: "Sudah dibeli" }).first();
  if (await buy.count()) {
    await buy.click();
    await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
    await page.getByText("dicatat", { exact: false }).waitFor({ timeout: 10000 }).catch(() => problems.push("buying showed no confirmation"));
  }

  await page.goto(`${base}/#/pengeluaran`);
  await page.getByRole("button", { name: "Listrik & air" }).click();
  await page.fill("#amt", "123456");
  await page.getByRole("button", { name: "Simpan pengeluaran" }).click();
  await page.getByText("Rp123.456").first().waitFor({ timeout: 10000 }).catch(() => problems.push("new expense not listed"));
  const row = page.getByRole("row", { name: /Rp123\.456/ });
  await row.getByRole("button", { name: "Hapus" }).click();
  await page.waitForTimeout(800);
  expect(await page.getByRole("row", { name: /Rp123\.456/ }).count() === 0, "deleted expense still listed");

  // a menu item costed the simple way: money spent and portions it makes
  await page.goto(`${base}/#/menu`);
  await page.getByRole("button", { name: "Menu baru" }).click();
  await page.fill("#mn", "Nasi Uduk Uji");
  await page.fill("#mp", "10000");
  await page.fill("#bc", "120000");
  await page.fill("#bq", "30");
  await page.getByRole("dialog").getByText("Rp4.000", { exact: false }).first().waitFor({ timeout: 5000 }).catch(() => problems.push("simple cost not shown"));
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await page.getByRole("row", { name: /Nasi Uduk Uji/ }).waitFor({ timeout: 10000 }).catch(() => problems.push("new menu item not listed"));

  await page.goto(`${base}/#/ringkasan`);
  await page.getByRole("heading", { name: "Saran penjualan minggu depan" }).waitFor({ timeout: 15000 }).catch(() => problems.push("weekly summary has no sales tips"));

  await page.goto(`${base}/#/simulasi`);
  await page.getByRole("button", { name: "Hitung", exact: true }).click();
  await page.getByRole("heading", { name: /Hasil untuk/ }).waitFor({ timeout: 20000 }).catch(() => problems.push("what-if showed no result"));
  await page.screenshot({ path: `${out}/desktop-dark-simulasi-hasil.png`, fullPage: true });

  // theme toggle: dark -> light
  await page.getByRole("button", { name: "Pakai tampilan terang" }).first().click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme) === "light", "theme toggle did not switch to light");
  // language toggle
  await page.getByRole("button", { name: "Switch to English" }).first().click();
  await page.getByRole("link", { name: "Home" }).first().waitFor({ timeout: 5000 }).catch(() => problems.push("language toggle did not switch to English"));
  await page.close();
}

// 3. desktop, light, English: every page
{
  const page = await open("desktop-en", { viewport: { width: 1360, height: 900 } }, "en");
  await signIn(page);
  await tour(page, "desktop-en", 1);
  await page.goto(`${base}/#/simulasi`);
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await page.getByRole("heading", { name: /Result for/ }).waitFor({ timeout: 20000 }).catch(() => problems.push("what-if (EN) showed no result"));
  await page.close();
}

await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("e2e ok");
