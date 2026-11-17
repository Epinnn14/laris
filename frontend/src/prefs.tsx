import { t, type Lang } from "./i18n";
import type { Theme } from "./theme";
import { Icon } from "./ui";

export interface Prefs { lang: Lang; theme: Theme; setLang: (l: Lang) => void; setTheme: (t: Theme) => void }

/** Theme and language, one tap away on every page. */
export function QuickPrefs({ prefs, compact }: { prefs: Prefs; compact?: boolean }) {
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <div className="row">
      <button className="btn ghost small" onClick={() => prefs.setLang(prefs.lang === "id" ? "en" : "id")}
              aria-label={prefs.lang === "id" ? "Switch to English" : "Ganti ke Bahasa Indonesia"}>
        {prefs.lang === "id" ? "EN" : "ID"}
      </button>
      <button className="btn ghost small icon" onClick={() => prefs.setTheme(dark ? "light" : "dark")}
              aria-label={dark ? t("Pakai tampilan terang") : t("Pakai tampilan gelap")}>
        {dark ? <Icon.sun /> : <Icon.moon />}
      </button>
      {!compact && <span className="tiny muted">{t("Bahasa dan tampilan")}</span>}
    </div>
  );
}
