"use client";
import { useState, useEffect } from "react";

export function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("tlog_theme");
    setDark(saved === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("tlog_theme", next ? "dark" : "light");
  };

  return { dark, toggle };
}
