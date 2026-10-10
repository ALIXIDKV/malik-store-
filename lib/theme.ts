export type Theme = "dark" | "light";
export const THEME_KEY = "malik-theme";
export const THEME_COLOR: Record<Theme, string> = { dark: "#09090b", light: "#f4f5f7" };

// Dijalankan di <head> sebelum paint: mencegah flash tema salah & hydration mismatch.
export const THEME_INIT_SCRIPT = `(function(){var t="dark";try{var s=localStorage.getItem("${THEME_KEY}");if(s==="light"||s==="dark")t=s}catch(e){}document.documentElement.setAttribute("data-theme",t)})();`;

export function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage diblokir: tema tetap berlaku untuk sesi ini */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}
