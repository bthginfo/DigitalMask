"use client";
import { Laptop, Moon, Sun } from "lucide-react";
import { useStoredValue } from "@/shared/client-storage";
export function ThemeSwitch({ full = false }: { full?: boolean }) {
  const [theme, setTheme] = useStoredValue("digitalmask-theme", "system");
  const update = (next: string) => {
    setTheme(next);
    document.documentElement.setAttribute(
      "data-theme",
      next === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : next,
    );
  };
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Laptop;
  return full ? (
    <div className="segmented">
      {[
        ["light", "Hell"],
        ["dark", "Dunkel"],
        ["system", "System"],
      ].map(([key, label]) => (
        <button
          type="button"
          key={key}
          className={theme === key ? "active" : ""}
          onClick={() => update(key)}
        >
          {label}
        </button>
      ))}
    </div>
  ) : (
    <button
      type="button"
      className="icon-button"
      title={`Darstellung: ${theme === "system" ? "System" : theme === "dark" ? "Dunkel" : "Hell"}`}
      aria-label="Darstellung wechseln"
      onClick={() => update(theme === "system" ? "light" : theme === "light" ? "dark" : "system")}
    >
      <Icon size={19} />
    </button>
  );
}
