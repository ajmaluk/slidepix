import { useEffect } from "react";
import { useChatStore } from "@/stores/chatStore";

type ResolvedTheme = "dark" | "light";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export default function ThemeSync() {
  const mode = useChatStore((s) => s.settings.personalization.theme);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (mode !== "system") {
      applyTheme(mode);
      return;
    }

    applyTheme(getSystemTheme());

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(getSystemTheme());

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  return null;
}
