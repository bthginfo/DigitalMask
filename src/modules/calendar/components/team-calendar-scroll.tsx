"use client";
import {
  useEffect,
  useCallback,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./mobile-calendar.module.css";
import { useWorkspace } from "@/components/workspace-context";
import { readViewState, writeViewState } from "@/shared/view-state";

export function TeamCalendarScroll({ children, month }: { children: ReactNode; month: boolean }) {
  const { workspace } = useWorkspace();
  const scope = `team-calendar-scroll:${typeof location === "undefined" ? "all" : new URLSearchParams(location.search).get("productionId") || "all"}:${month ? "month" : "week"}`;
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ max: 0, thumb: 100, position: 0 });
  const [edges, setEdges] = useState({ left: true, right: true });
  const sync = useCallback(
    (left: number) => {
      const table = body.current;
      if (!table) return;
      const position = Math.max(0, Math.min(left, table.scrollWidth - table.clientWidth));
      if (table.scrollLeft !== position) table.scrollLeft = position;
      writeViewState(workspace.user.id, scope, "left", position);
      setMetrics((current) => (current.position === position ? current : { ...current, position }));
      setEdges((current) => {
        const next = {
          left: position <= 1,
          right: position >= table.scrollWidth - table.clientWidth - 1,
        };
        return current.left === next.left && current.right === next.right ? current : next;
      });
    },
    [scope, workspace.user.id],
  );
  useEffect(() => {
    const table = body.current;
    if (!table) return;
    const update = () => {
      const max = Math.max(0, table.scrollWidth - table.clientWidth);
      const thumb = Math.max(
        8,
        Math.min(100, (table.clientWidth / table.scrollWidth) * 100 || 100),
      );
      setMetrics((current) =>
        current.max === max && current.thumb === thumb ? current : { ...current, max, thumb },
      );
      sync(table.scrollLeft);
    };
    const observer = new ResizeObserver(update);
    observer.observe(table);
    if (table.firstElementChild) observer.observe(table.firstElementChild);
    table.scrollLeft = readViewState(workspace.user.id, scope, "left", 0);
    update();
    return () => observer.disconnect();
  }, [month, scope, workspace.user.id, sync]);
  const move = (direction: number) => sync((body.current?.scrollLeft || 0) + direction * 240);
  const keyScroll = (event: KeyboardEvent<HTMLDivElement | HTMLInputElement>) => {
    if (event.target !== event.currentTarget) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => move(-1),
      ArrowRight: () => move(1),
      Home: () => sync(0),
      End: () => sync(body.current?.scrollWidth || 0),
    };
    if (actions[event.key]) {
      event.preventDefault();
      actions[event.key]();
    }
  };
  return (
    <div className={styles.teamScroll}>
      <div className={styles.scrollControls} hidden={!metrics.max}>
        <span>Tage seitlich verschieben</span>
        <div>
          <button
            type="button"
            className="icon-button"
            aria-label="Kalender nach links verschieben"
            aria-controls={id}
            disabled={edges.left}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Kalender nach rechts verschieben"
            aria-controls={id}
            disabled={edges.right}
            onClick={() => move(1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <input
        type="range"
        className={styles.topScrollbar}
        style={{ "--scroll-thumb-width": `${metrics.thumb}%` } as CSSProperties}
        data-team-scroll="top"
        hidden={!metrics.max}
        aria-label="Kalender oben horizontal verschieben"
        aria-controls={id}
        min={0}
        max={metrics.max}
        step={1}
        value={metrics.position}
        onKeyDown={keyScroll}
        onChange={(event) => sync(Number(event.target.value))}
      />
      <div
        ref={body}
        id={id}
        data-team-scroll="bottom"
        className={`table-scroll team-calendar ${month ? "team-month-calendar" : ""}`}
        role="region"
        aria-label={month ? "Teammonatskalender" : "Teamwochenkalender"}
        tabIndex={0}
        onKeyDown={keyScroll}
        onScroll={(event) => sync(event.currentTarget.scrollLeft)}
      >
        {children}
      </div>
    </div>
  );
}
