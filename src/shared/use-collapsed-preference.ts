"use client";

import { useSyncExternalStore } from "react";

const fallback = new Map<string, boolean>();
const changeEvent = "digitalmask:collapsed-preference";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}

function read(key: string, defaultCollapsed: boolean) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? (fallback.get(key) ?? defaultCollapsed) : stored === "collapsed";
  } catch {
    return fallback.get(key) ?? defaultCollapsed;
  }
}

export function useCollapsedPreference(key: string, defaultCollapsed = false) {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => read(key, defaultCollapsed),
    () => defaultCollapsed,
  );
  const setCollapsed = (next: boolean) => {
    fallback.set(key, next);
    try {
      localStorage.setItem(key, next ? "collapsed" : "expanded");
    } catch {
      // Keep the preference for this session when device storage is unavailable.
    }
    window.dispatchEvent(new Event(changeEvent));
  };
  return [collapsed, setCollapsed] as const;
}
