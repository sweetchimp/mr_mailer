import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const THEME_KEY = "nuvio-theme";

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
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY) as Theme | null;
      return stored && ["light", "dark", "system"].includes(stored) ? stored : "system";
    } catch {
      return "system";
    }
  });

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
      style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-line)" }}
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
              background: active ? (light ? "rgba(255,255,255,0.22)" : "var(--color-brand-blue)") : "transparent",
            }}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}
