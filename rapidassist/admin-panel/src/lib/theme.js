import { useEffect, useState } from "react";

function readTheme() {
  try {
    return localStorage.getItem("ra-admin-theme");
  } catch {
    return null;
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => readTheme());

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    try {
      if (theme) localStorage.setItem("ra-admin-theme", theme);
      else localStorage.removeItem("ra-admin-theme");
    } catch {
      /* storage unavailable – theme just won't persist */
    }
  }, [theme]);

  const isDark = theme ? theme === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return { isDark, toggle: () => setTheme(isDark ? "light" : "dark") };
}
