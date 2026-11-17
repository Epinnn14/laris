// Light, dark, or follow the phone. The choice is per device (each phone or laptop can differ).
export type Theme = "system" | "light" | "dark";

export function savedTheme(): Theme {
  try { const v = localStorage.getItem("laris-theme"); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; }
}

export function applyTheme(th: Theme) {
  const root = document.documentElement;
  if (th === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", th);
  try { localStorage.setItem("laris-theme", th); } catch { /* storage blocked */ }
  const dark = th === "dark" || (th === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#201b16" : "#fffcf6");
}

export const isDark = () => {
  const a = document.documentElement.getAttribute("data-theme");
  return a ? a === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};
