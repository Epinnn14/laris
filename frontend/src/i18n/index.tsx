// Two languages. Indonesian is the source: t("Teks Indonesia") looks the text up in the English table
// when English is on. {name} placeholders are filled from `vars`. scripts/check-i18n.mjs fails the build
// when a t("...") text has no English entry.

import { createContext, useContext, type ReactNode } from "react";
import { EN } from "./en";

export type Lang = "id" | "en";
let current: Lang = "id";

export const getLang = () => current;
/** persist: remember on this device (the owner picked it here), not just follow the shop's setting. */
export function setLang(l: Lang, persist = false) {
  current = l;
  document.documentElement.lang = l;
  if (persist) try { localStorage.setItem("laris-lang", l); } catch { /* storage blocked */ }
}
export function savedLang(): Lang | null {
  try { const v = localStorage.getItem("laris-lang"); return v === "en" || v === "id" ? v : null; } catch { return null; }
}

const warned = new Set<string>();

export function t(text: string, vars?: Record<string, string | number>): string {
  let out = text;
  if (current === "en") {
    if (text in EN) out = EN[text];
    else if (text && !warned.has(text)) { warned.add(text); console.warn(`[i18n] missing English text: ${text}`); }
  }
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

const LangContext = createContext<Lang>("id");
export const LangProvider = ({ lang, children }: { lang: Lang; children: ReactNode }) => (
  <LangContext.Provider value={lang}>{children}</LangContext.Provider>
);
/** Re-render a component when the language changes. */
export const useLang = () => useContext(LangContext);
