export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "traverse-theme";

// Runs before first paint so a stored choice never flashes the wrong theme. It
// lives in the browser rather than a cookie because reading a cookie in the root
// layout would stop every page from being prerendered.
export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});document.documentElement.dataset.theme=t==="light"||t==="dark"?t:"system"}catch(e){document.documentElement.dataset.theme="system"}`;
