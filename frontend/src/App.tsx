import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, type AppState } from "./api";
import { Icon, Loading, Toaster } from "./ui";
import Masuk from "./pages/Masuk";
import Beranda from "./pages/Beranda";
import Catat from "./pages/Catat";
import Stok from "./pages/Stok";
import Prediksi from "./pages/Prediksi";
import Belanja from "./pages/Belanja";
import Menu from "./pages/Menu";
import Pengaturan from "./pages/Pengaturan";

type Route = { path: string; label: string; short: string; icon: (p: { size?: number }) => ReactNode; mobile: boolean };
const ROUTES: Route[] = [
  { path: "beranda", label: "Beranda", short: "Beranda", icon: Icon.home, mobile: true },
  { path: "catat", label: "Catat penjualan", short: "Catat", icon: Icon.pencil, mobile: true },
  { path: "stok", label: "Stok bahan", short: "Stok", icon: Icon.box, mobile: true },
  { path: "prediksi", label: "Prediksi", short: "Prediksi", icon: Icon.chart, mobile: true },
  { path: "belanja", label: "Daftar belanja", short: "Belanja", icon: Icon.cart, mobile: true },
  { path: "menu", label: "Menu & resep", short: "Menu", icon: Icon.bowl, mobile: false },
  { path: "pengaturan", label: "Pengaturan", short: "Atur", icon: Icon.gear, mobile: false },
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
  const [route, query] = useHashRoute();
  const refresh = useCallback(async () => setState(await api.get<AppState>("/state")), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const on = () => refresh();
    window.addEventListener("laris:unauthorized", on);
    return () => window.removeEventListener("laris:unauthorized", on);
  }, [refresh]);

  if (!state) return <Loading />;
  if (!state.authed) return <><Masuk setup={state.setup_needed} onDone={refresh} /><Toaster /></>;

  const page = (() => {
    switch (route) {
      case "catat": return <Catat today={state.today} initialDay={new URLSearchParams(query).get("hari")} />;
      case "stok": return <Stok today={state.today} />;
      case "prediksi": return <Prediksi />;
      case "belanja": return <Belanja today={state.today} />;
      case "menu": return <Menu business={state.business} />;
      case "pengaturan": return <Pengaturan state={state} onChange={refresh} />;
      default: return <Beranda state={state} />;
    }
  })();
  const current = ROUTES.find((r) => r.path === route) ? route : "beranda";

  return (
    <div className="shell">
      <nav className="side" aria-label="Navigasi utama">
        <div className="brand"><span className="brand-mark"><Icon.logo size={20} /></span>Laris</div>
        {ROUTES.map((r) => (
          <a key={r.path} className="navlink" href={`#/${r.path}`} aria-current={current === r.path ? "page" : undefined}>
            <r.icon />{r.label}
          </a>
        ))}
        <div className="foot small muted">{state.shop_name}{state.demo_mode && " · mode demo"}</div>
      </nav>
      <div>
        <header className="topbar">
          <div className="row"><span className="brand-mark"><Icon.logo size={18} /></span><strong>{state.shop_name}</strong></div>
          <div className="row">
            <a className="btn ghost small" href="#/menu" aria-label="Menu & resep"><Icon.bowl /></a>
            <a className="btn ghost small" href="#/pengaturan" aria-label="Pengaturan"><Icon.gear /></a>
          </div>
        </header>
        <main id="main">{page}</main>
      </div>
      <nav className="bottomnav" aria-label="Navigasi">
        {ROUTES.filter((r) => r.mobile).map((r) => (
          <a key={r.path} href={`#/${r.path}`} aria-current={current === r.path ? "page" : undefined}>
            <r.icon />{r.short}
          </a>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
