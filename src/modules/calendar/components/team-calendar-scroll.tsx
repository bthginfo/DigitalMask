"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./mobile-calendar.module.css";

export function TeamCalendarScroll({ children, month }: { children: ReactNode; month: boolean }) {
  const id = useId();
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [edges, setEdges] = useState({ left: true, right: true });
  const sync = (left: number) => {
    const table = body.current;
    if (!table) return;
    const position = Math.max(0, Math.min(left, table.scrollWidth - table.clientWidth));
    if (top.current && top.current.scrollLeft !== position) top.current.scrollLeft = position;
    if (table.scrollLeft !== position) table.scrollLeft = position;
    setEdges((current) => {
      const next = {
        left: position <= 1,
        right: position >= table.scrollWidth - table.clientWidth - 1,
      };
      return current.left === next.left && current.right === next.right ? current : next;
    });
  };
  useEffect(() => {
    const table = body.current;
    if (!table) return;
    const update = () => {
      setWidth(table.scrollWidth);
      sync(table.scrollLeft);
    };
    const observer = new ResizeObserver(update);
    observer.observe(table);
    if (table.firstElementChild) observer.observe(table.firstElementChild);
    update();
    return () => observer.disconnect();
  }, []);
  const move = (direction: number) => sync((body.current?.scrollLeft || 0) + direction * 240);
  const keyScroll = (event: KeyboardEvent<HTMLDivElement>) => {
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
      <div className={styles.scrollControls}>
        <span>Weitere Tage · oben oder unten verschieben</span>
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
      <div
        ref={top}
        className={styles.topScrollbar}
        data-team-scroll="top"
        role="region"
        aria-label="Kalender oben horizontal verschieben"
        tabIndex={0}
        onKeyDown={keyScroll}
        onScroll={(event) => sync(event.currentTarget.scrollLeft)}
      >
        <div style={{ width, height: 1 }} />
      </div>
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
