"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

/** Must stay in sync with the init script in src/app/layout.tsx. */
const THEME_KEY = "mr-mailer-theme";

function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeSwitcher({
  light = false,
  className,
}: {
  light?: boolean;
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme>("system");

  // Read localStorage after mount: the server has no access to it, and
  // reading during render would desync the hydration markup.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setTheme(stored);
      }
    } catch {
      // storage unavailable — fall back to "system"
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage unavailable
    }
  }, [theme]);

  const baseColor = light ? "#FFFFFF" : "var(--color-ink-soft)";
  const activeColor = light ? "#FFFFFF" : "var(--color-brand-blue)";

  const options: { value: Theme; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "☀" },
    { value: "dark", label: "Dark", icon: "☾" },
    { value: "system", label: "Auto", icon: "◐" },
  ];

  return (
    <div
      className={`inline-flex items-center rounded-lg p-0.5 ${className ?? ""}`}
      style={{
        background: "var(--color-surface-soft)",
        border: "1px solid var(--color-line)",
      }}
      role="group"
      aria-label="Color theme"
    >
      {options.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-pressed={active}
            title={opt.label}
            className="cursor-pointer rounded-md px-2 py-1 text-[11px] leading-none transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              color: active ? activeColor : baseColor,
              background: active
                ? light
                  ? "rgba(255,255,255,0.22)"
                  : "var(--color-brand-blue)"
                : "transparent",
            }}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}
