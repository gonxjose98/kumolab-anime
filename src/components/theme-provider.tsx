"use client";

import { createContext, useContext, useState, useCallback } from "react";

export const ThemeContext = createContext({
  light: false,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [light, setLight] = useState(false);
  const toggle = useCallback(() => setLight((p) => !p), []);

  return (
    <ThemeContext.Provider value={{ light, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const { light } = useContext(ThemeContext);
  return {
    light,
    bg: light ? "#1c1b3a" : "#06060e",
    surface: light ? "rgba(200,200,240,0.12)" : "rgba(12,12,20,0.6)",
    surfaceHover: light ? "rgba(200,200,240,0.18)" : "rgba(12,12,20,0.8)",
    surfaceSolid: light ? "rgba(180,180,230,0.15)" : "rgba(10,10,18,0.95)",
    border: light ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
    borderHover: light ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)",
    text: light ? "#e8e8ff" : "#e8e8f8",
    textSoft: light ? "#c8c8e8" : "#d0d0e8",
    textMuted: light ? "#a0a0d0" : "#8888a8",
    textDim: light ? "#8080b8" : "#55556a",
    textDimmer: light ? "#7070a8" : "#44445a",
    navBg: light ? "rgba(28,27,58,0.85)" : "rgba(6,6,14,0.92)",
    navBorder: light ? "rgba(0,212,255,0.12)" : "rgba(0,212,255,0.08)",
    dropBg: light ? "rgba(30,30,65,0.95)" : "rgba(10,10,18,0.95)",
    feedBg: light ? "rgba(28,27,58,0.4)" : "rgba(6,6,14,0.5)",
    feedOverlayTop: light ? "rgba(28,27,58,0.2)" : "rgba(6,6,14,0.3)",
    feedOverlayBot: light ? "rgba(28,27,58,0.82)" : "rgba(6,6,14,0.85)",
    feedOverlayEnd: light ? "rgba(28,27,58,0.96)" : "rgba(6,6,14,0.98)",
    cyan: "#00d4ff",
    magenta: "#ff3cac",
    violet: "#7b61ff",
    orange: "#ff6b35",
  };
}
