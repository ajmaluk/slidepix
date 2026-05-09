/**
 * Theme Management Hook
 * 
 * Handles theme mode switching (light, dark, system), persistence in local settings,
 * and immediate theme application to prevent FOUC (Flash of Unstyled Content).
 */

import { loadSettings } from "@/lib/settings";

export type ThemeMode = "dark" | "light" | "system";

/**
 * Detects the current system theme preference.
 */
function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Low-level utility to apply the theme class to the document root.
 */
function applyTheme(theme: "dark" | "light") {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

/**
 * Immediate Theme Initialization
 * Executed as an IIFE to set the correct theme class before the first React render.
 * This prevents the annoying "white flash" on page load in dark mode.
 */
(function initTheme() {
  if (typeof window === "undefined") return;
  try {
    const settings = loadSettings();
    const theme: ThemeMode = settings.personalization.theme || "system";
    applyTheme(theme === "system" ? getSystemTheme() : theme);
  } catch {
    document.documentElement.classList.add("dark");
  }
})();
