"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/** Only this browser tab's context is retained, keeping a fresh session on the current season. */
export function viewStateKey(userId: string, scope: string, field: string) {
  return `digitalmask-view:${userId}:${scope}:${field}`;
}

export function readViewState<T>(userId: string, scope: string, field: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = sessionStorage.getItem(viewStateKey(userId, scope, field));
    if (stored === null) return fallback;
    const parsed = JSON.parse(stored);
    if (parsed === null) return fallback === null ? parsed : fallback;
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? (parsed as T) : fallback;
    if (fallback !== null && (typeof parsed !== typeof fallback || Array.isArray(parsed)))
      return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeViewState<T>(userId: string, scope: string, field: string, state: T) {
  try {
    sessionStorage.setItem(viewStateKey(userId, scope, field), JSON.stringify(state));
  } catch {
    // Storage restrictions must never prevent working in the app.
  }
}

export function useViewState<T>(
  userId: string,
  scope: string,
  field: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() =>
    readViewState(
      userId,
      scope,
      field,
      typeof initial === "function" ? (initial as () => T)() : initial,
    ),
  );
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setState((current) => {
        const result = typeof next === "function" ? (next as (state: T) => T)(current) : next;
        writeViewState(userId, scope, field, result);
        return result;
      });
    },
    [userId, scope, field],
  );
  return [state, update];
}
