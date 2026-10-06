"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import styles from "./calendar-presentation.module.css";

/** Layout controls keep the planner mounted, so dates, filters and drafts stay intact. */
export function useCalendarPresentation(root: RefObject<HTMLDivElement | null>) {
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const exitFullscreen = useCallback(() => setFullscreen(false), []);
  useEffect(() => {
    if (!fullscreen || !root.current) return;
    const element = root.current;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    // Keep keyboard focus in the visible calendar. Native dialogs remain in the top layer.
    const outside: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = element;
    while (branch.parentElement && branch.parentElement !== document.body) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          outside.push({ element: sibling, inert: sibling.inert });
          sibling.toggleAttribute("inert", true);
        }
      }
      branch = branch.parentElement;
    }
    const exit = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      setFullscreen(false);
    };
    document.addEventListener("keydown", exit);
    return () => {
      document.removeEventListener("keydown", exit);
      document.documentElement.style.overflow = previousOverflow;
      outside.forEach(({ element: sibling, inert }) => sibling.toggleAttribute("inert", inert));
      const target = returnFocus.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [fullscreen, root]);
  return {
    collapsed,
    fullscreen,
    toggleFilters: () => setCollapsed((value) => !value),
    toggleFullscreen: () => {
      if (!fullscreen && document.activeElement instanceof HTMLElement)
        returnFocus.current = document.activeElement;
      setFullscreen((value) => !value);
    },
    exitFullscreen,
  };
}

export function CalendarPresentationControls({
  collapsed,
  fullscreen,
  filtersId,
  onToggleFilters,
  onToggleFullscreen,
}: {
  collapsed: boolean;
  fullscreen: boolean;
  filtersId: string;
  onToggleFilters: () => void;
  onToggleFullscreen: () => void;
}) {
  const PanelIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const ScreenIcon = fullscreen ? Minimize2 : Maximize2;
  return (
    <div className={styles.controls} aria-label="Kalenderdarstellung">
      <button
        type="button"
        className="button"
        aria-expanded={!collapsed}
        aria-controls={filtersId}
        onClick={onToggleFilters}
      >
        <PanelIcon size={16} aria-hidden="true" />
        {collapsed ? "Filter einblenden" : "Filter einklappen"}
      </button>
      <button
        type="button"
        className="button"
        aria-pressed={fullscreen}
        onClick={onToggleFullscreen}
        title={fullscreen ? "Vollbild verlassen (Escape)" : "Kalender im Vollbild anzeigen"}
      >
        <ScreenIcon size={16} aria-hidden="true" />
        {fullscreen ? "Vollbild verlassen" : "Vollbild"}
      </button>
    </div>
  );
}
