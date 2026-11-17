import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type AppState } from "./api";
import { LangProvider, savedLang, setLang, t, type Lang } from "./i18n";
import { applyTheme, savedTheme, type Theme } from "./theme";
import { Icon, Loading, Toaster } from "./ui";
import { QuickPrefs, type Prefs } from "./prefs";
import Masuk from "./pages/Masuk";
import Beranda from "./pages/Beranda";
import Catat from "./pages/Catat";
import Stok from "./pages/Stok";
import Prediksi from "./pages/Prediksi";
import Belanja from "./pages/Belanja";
import Menu from "./pages/Menu";
import Pengaturan from "./pages/Pengaturan";
import Pengeluaran from "./pages/Pengeluaran";
import Ringkasan from "./pages/Ringkasan";
import Simulasi from "./pages/Simulasi";
import Lainnya from "./pages/Lainnya";

type IconT = (p: { size?: number }) => ReactNode;
export type Route = { path: string; label: string; short: string; icon: IconT; group: string; mobile: boolean; hint: string };
export const ROUTES: Route[] = [
  { path: "beranda", label: "Beranda", short: "Beranda", icon: Icon.home, group: "Setiap hari", mobile: true, hint: "Untung, target, dan yang perlu dilakukan" },
  { path: "catat", label: "Catat penjualan", short: "Catat", icon: Icon.pencil, group: "Setiap hari", mobile: true, hint: "Isi porsi terjual hari ini" },
  { path: "stok", label: "Stok bahan", short: "Stok", icon: Icon.box, group: "Setiap hari", mobile: true, hint: "Beli, hitung, dan buang bahan" },
  { path: "belanja", label: "Daftar belanja", short: "Belanja", icon: Icon.cart, group: "Setiap hari", mobile: true, hint: "Bahan yang perlu dibeli dan berapa banyak" },
  { path: "pengeluaran", label: "Pengeluaran", short: "Biaya", icon: Icon.wallet, group: "Setiap hari", mobile: false, hint: "Gas, listrik, sewa, gaji, dan biaya lain" },
  { path: "ringkasan", label: "Ringkasan minggu", short: "Ringkasan", icon: Icon.notes, group: "Rencana", mobile: false, hint: "Apa yang naik, turun, dan langkah minggu depan" },
  { path: "prediksi", label: "Prediksi", short: "Prediksi", icon: Icon.chart, group: "Rencana", mobile: false, hint: "Perkiraan penjualan 4 minggu ke depan" },
  { path: "simulasi", label: "Coba hitung", short: "Simulasi", icon: Icon.scale, group: "Rencana", mobile: false, hint: "Kalau harga naik atau ada promo, jadi berapa?" },
  { path: "menu", label: "Menu & resep", short: "Menu", icon: Icon.bowl, group: "Data toko", mobile: false, hint: "Harga jual, resep, modal per porsi" },
  { path: "pengaturan", label: "Pengaturan", short: "Atur", icon: Icon.gear, group: "Data toko", mobile: false, hint: "Profil usaha, target, tampilan, bahasa" },
];

function useHashRoute(): [string, string] {
  const read = () => {
    const [p, q = ""] = window.location.hash.replace(/^#\/?/, "").split("?");
    return [p || "beranda", q] as [string, string];
  };
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => { setR(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}


export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [failed, setFailed] = useState(false);
  const [lang, setLangState] = useState<Lang>(() => { const l = savedLang() ?? "id"; setLang(l); return l; });
  const [theme, setThemeState] = useState<Theme>(() => { const th = savedTheme(); applyTheme(th); return th; });
  const [route, query] = useHashRoute();

  const authed = useRef(false);
  authed.current = !!state?.authed;
  const changeLang = useCallback((l: Lang) => {
    setLang(l, true);
    setLangState(l);
    // signed in: the shop remembers it too; before that it is kept on this device only
    if (authed.current) api.put("/settings", { language: l }).catch(() => { /* kept on this device */ });
  }, []);
  const changeTheme = useCallback((th: Theme) => { applyTheme(th); setThemeState(th); }, []);
  const prefs: Prefs = { lang, theme, setLang: changeLang, setTheme: changeTheme };

  const refresh = useCallback(async () => {
    try {
      const st = await api.get<AppState>("/state");
      setFailed(false);
      setState(st);
      // the shop's language wins once signed in, unless this device chose one itself
      if (st.authed && !savedLang() && st.language) { setLang(st.language); setLangState(st.language); }
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const on = () => refresh();
    window.addEventListener("laris:unauthorized", on);
    return () => window.removeEventListener("laris:unauthorized", on);
  }, [refresh]);
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  if (failed) return (
    <LangProvider lang={lang}><div className="center"><div className="card pad stack" style={{ maxWidth: 420 }}>
      <h2>{t("Laris belum bisa dihubungi")}</h2>
      <p className="muted">{t("Pastikan server Laris menyala dan alamatnya benar, lalu coba lagi.")}</p>
      <button className="btn primary" onClick={refresh}>{t("Coba lagi")}</button>
    </div></div></LangProvider>
  );
  if (!state) return <Loading />;
  if (!state.authed) return (
    <LangProvider lang={lang}><Masuk setup={state.setup_needed} shopName={state.shop_name} prefs={prefs} onDone={refresh} /><Toaster /></LangProvider>
  );

  const page = (() => {
    switch (route) {
      case "catat": return <Catat today={state.today} initialDay={new URLSearchParams(query).get("hari")} />;
      case "stok": return <Stok today={state.today} />;
      case "prediksi": return <Prediksi />;
      case "belanja": return <Belanja today={state.today} />;
      case "menu": return <Menu business={state.business} />;
      case "pengaturan": return <Pengaturan state={state} prefs={prefs} onChange={refresh} />;
      case "pengeluaran": return <Pengeluaran today={state.today} />;
      case "ringkasan": return <Ringkasan state={state} />;
      case "simulasi": return <Simulasi today={state.today} />;
      case "lainnya": return <Lainnya prefs={prefs} />;
      default: return <Beranda state={state} />;
    }
  })();
  const current = ROUTES.find((r) => r.path === route) || route === "lainnya" ? route : "beranda";
  const groups = [...new Set(ROUTES.map((r) => r.group))];
  const moreActive = route === "lainnya" || ROUTES.some((r) => r.path === route && !r.mobile);

  return (
    <LangProvider lang={lang}>
      <a className="skip" href="#main">{t("Langsung ke isi")}</a>
      <div className="shell">
        <nav className="side" aria-label={t("Navigasi utama")}>
          <div className="brand"><span className="brand-mark"><Icon.logo size={20} /></span>Laris</div>
          <div className="shop-name">{state.shop_name}{state.demo_mode && ` · ${t("mode demo")}`}</div>
          {groups.map((g) => (
            <div key={g}>
              <div className="nav-group">{t(g)}</div>
              {ROUTES.filter((r) => r.group === g).map((r) => (
                <a key={r.path} className="navlink" href={`#/${r.path}`} aria-current={current === r.path ? "page" : undefined}>
                  <r.icon />{t(r.label)}
                </a>
              ))}
            </div>
          ))}
          <div className="foot">
            <QuickPrefs prefs={prefs} />
          </div>
        </nav>
        <div>
          <header className="topbar">
            <div className="row" style={{ minWidth: 0 }}><span className="brand-mark"><Icon.logo size={18} /></span><strong>{state.shop_name}</strong></div>
            <QuickPrefs prefs={prefs} compact />
          </header>
          <main id="main" tabIndex={-1}>{page}</main>
        </div>
        <nav className="bottomnav" aria-label={t("Navigasi")}>
          {ROUTES.filter((r) => r.mobile).map((r) => (
            <a key={r.path} href={`#/${r.path}`} aria-current={current === r.path ? "page" : undefined}>
              <r.icon />{t(r.short)}
            </a>
          ))}
          <a href="#/lainnya" aria-current={moreActive ? "page" : undefined}><Icon.more />{t("Lainnya")}</a>
        </nav>
        <Toaster />
      </div>
    </LangProvider>
  );
}
