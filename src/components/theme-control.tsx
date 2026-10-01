"use client";

import { useEffect, useSyncExternalStore } from "react";

type ThemePreference = "auto" | "day" | "night";
const preferenceKey = "nha-minh:light-preference";
const preferenceEvent = "nha-minh:light-change";
let sessionPreference: ThemePreference | undefined;

function readPreference(): ThemePreference {
  if (sessionPreference !== undefined) return sessionPreference;
  try {
    const saved = localStorage.getItem(preferenceKey);
    if (saved === "day" || saved === "night" || saved === "auto") return saved;
  } catch {
    // The automatic theme also works when browser storage is unavailable.
  }
  return "auto";
}

function subscribePreference(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === preferenceKey || event.key === null) {
      sessionPreference = undefined;
      onChange();
    }
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(preferenceEvent, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(preferenceEvent, onChange);
  };
}

function serverPreference(): ThemePreference {
  return "auto";
}

function localTheme(): "day" | "night" {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "day" : "night";
}

export function ThemeControl() {
  const preference = useSyncExternalStore(
    subscribePreference,
    readPreference,
    serverPreference,
  );

  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        preference === "auto" ? localTheme() : preference;
    };
    applyTheme();
    const timer = window.setInterval(applyTheme, 60_000);
    return () => window.clearInterval(timer);
  }, [preference]);

  function changePreference(value: string) {
    if (value !== "auto" && value !== "day" && value !== "night") return;
    sessionPreference = value;
    try {
      localStorage.setItem(preferenceKey, value);
    } catch {
      // Keep the selection for this visit if persistent storage is unavailable.
    }
    window.dispatchEvent(new Event(preferenceEvent));
  }

  return (
    <label className="theme-control">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-icon">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </svg>
      <span className="sr-only">Chọn giao diện ánh sáng</span>
      <select
        data-testid="theme-select"
        value={preference}
        onChange={(event) => changePreference(event.target.value)}
      >
        <option value="auto">Theo giờ máy</option>
        <option value="day">Ban ngày</option>
        <option value="night">Ban đêm</option>
      </select>
    </label>
  );
}
