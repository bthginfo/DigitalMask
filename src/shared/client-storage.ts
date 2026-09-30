"use client";
import { useCallback, useSyncExternalStore } from "react";
function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("digitalmask-storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("digitalmask-storage", callback);
  };
}
export function useStoredValue(key: string, fallback: string) {
  const snapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const serverSnapshot = useCallback(() => fallback, [fallback]);
  const stored = useSyncExternalStore(subscribeStorage, snapshot, serverSnapshot);
  const update = (value: string) => {
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event("digitalmask-storage"));
  };
  return [stored, update] as const;
}
export function subscribeConnectivity(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
export function subscribeLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}
export function subscribeMobile(callback: () => void) {
  const media = window.matchMedia("(max-width: 760px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
