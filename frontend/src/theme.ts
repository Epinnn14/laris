// Light or dark, chosen by the owner. Light is the default. The choice is per device.
export type Theme = "light" | "dark";

export function savedTheme(): Theme {
  try { return localStorage.getItem("laris-theme") === "dark" ? "dark" : "light"; } catch { return "light"; }
}

export function applyTheme(th: Theme) {
  document.documentElement.setAttribute("data-theme", th);
  try { localStorage.setItem("laris-theme", th); } catch { /* storage blocked */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", th === "dark" ? "#201b16" : "#fffcf6");
}
