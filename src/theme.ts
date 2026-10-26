import { useEffect, useState } from "react";
import type { Theme } from "./Account";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("winddesk-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      /* Browser privacy settings can disable storage. */
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0b0f16" : "#ffffff");
    try {
      localStorage.setItem("winddesk-theme", theme);
    } catch {
      /* Theme still works for this visit. */
    }
  }, [theme]);
  return [theme, setTheme] as const;
}
