"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import clsx from "clsx";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium">Dark mode</div>
        <div className="text-xs text-sub">Saved on this device.</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label="Toggle dark mode"
        onClick={toggle}
        className={clsx(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
          dark ? "bg-purple" : "bg-edge",
          !mounted && "opacity-60"
        )}
      >
        <span
          className={clsx(
            "inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform",
            dark ? "translate-x-5" : "translate-x-0.5"
          )}
        >
          {dark ? (
            <Moon className="w-3 h-3 text-purple" />
          ) : (
            <Sun className="w-3 h-3 text-sub" />
          )}
        </span>
      </button>
    </div>
  );
}
