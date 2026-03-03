"use client";
import { useState, useEffect } from "react";

const THEME_KEY = "tlog_theme";
const THEME_EVENT = "tlog-theme-change";

export function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // 初回読み込み
    setDark(localStorage.getItem(THEME_KEY) === "dark");

    // 他コンポーネントの toggle() を検知して同期
    const handler = (e: Event) => {
      setDark((e as CustomEvent).detail === "dark");
    };
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    const val = next ? "dark" : "light";
    localStorage.setItem(THEME_KEY, val);
    // 全コンポーネントに変更を通知
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: val }));
  };

  return { dark, toggle };
}
