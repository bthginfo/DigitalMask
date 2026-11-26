"use client";
import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A callback with a stable identity that always runs the latest render's logic. Use it for
 * event handlers passed to memoized or imperative widgets (FullCalendar, dnd-kit) so they do
 * not re-render just because a closure was recreated. Not for values read during render.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
