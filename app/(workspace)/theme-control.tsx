"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, THEMES, type Theme } from "@/lib/theme";

// The root element is the source of truth, so the control can't disagree with
// what the colour tokens are actually keyed off.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function choose(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked. The choice still applies until the page reloads.
  }
}

export function ThemeControl() {
  const current = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme,
    () => "system",
  );

  return (
    <div role="group" aria-label="Theme" className="flex overflow-hidden rounded border border-border">
      {THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          aria-pressed={current === theme}
          onClick={() => choose(theme)}
          className={`cursor-pointer px-2 py-1 capitalize ${
            current === theme ? "bg-surface text-foreground" : "text-muted"
          }`}
        >
          {theme}
        </button>
      ))}
    </div>
  );
}
