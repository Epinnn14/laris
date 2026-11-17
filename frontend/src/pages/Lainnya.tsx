// Phones show five tabs; everything else is listed here with what it is for.
import { ROUTES } from "../App";
import { t, useLang } from "../i18n";
import { type Prefs } from "../prefs";
import { PageHead } from "../ui";

export default function Lainnya({ prefs }: { prefs: Prefs }) {
  useLang();
  return (
    <>
      <PageHead title={t("Lainnya")} />
      <nav className="card" aria-label={t("Halaman lain")}>
        <div className="list">
          {ROUTES.filter((r) => !r.mobile).map((r) => (
            <a key={r.path} href={`#/${r.path}`} className="list-item" style={{ color: "var(--ink)", textDecoration: "none", minHeight: 60 }}>
              <span style={{ color: "var(--accent)" }}><r.icon /></span>
              <span className="grow"><strong>{t(r.label)}</strong><span className="small muted" style={{ display: "block" }}>{t(r.hint)}</span></span>
              <span className="muted" aria-hidden="true">›</span>
            </a>
          ))}
        </div>
      </nav>
      <p className="small muted" style={{ marginTop: 16 }}>
        {t("Tampilan: {th} · Bahasa: {l}", { th: prefs.theme === "dark" ? t("Gelap") : t("Terang"), l: prefs.lang === "en" ? "English" : "Bahasa Indonesia" })}
      </p>
    </>
  );
}
