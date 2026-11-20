import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

type Point = { x: number; y: number };
type ImageView = Point & { scale: number };
type Tap = { point: Point; time: number };

const fittedView: ImageView = { x: 0, y: 0, scale: 1 };
const maxScale = 5;
const pointerPosition = (event: PointerEvent<HTMLDivElement>): Point => ({
  x: event.clientX,
  y: event.clientY,
});
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function useGalleryZoom(ready: boolean, onMove?: (step: number) => void) {
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [view, setView] = useState(fittedView);
  const current = useRef(fittedView);
  const pointers = useRef(new Map<number, Point>());
  const press = useRef<(Tap & { moved: boolean }) | null>(null);
  const lastTap = useRef<Tap | null>(null);

  const applyView = useCallback((next: ImageView) => {
    const area = stage.current;
    const photo = image.current;
    if (!area || !photo?.naturalWidth || !photo.naturalHeight) return;
    const { clientWidth: width, clientHeight: height } = area;
    if (!width || !height) return;
    const fit = Math.min(width / photo.naturalWidth, height / photo.naturalHeight);
    const maxX = Math.max(0, (photo.naturalWidth * fit * next.scale - width) / 2);
    const maxY = Math.max(0, (photo.naturalHeight * fit * next.scale - height) / 2);
    const bounded = {
      scale: next.scale,
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
    const previous = current.current;
    if (previous.scale === bounded.scale && previous.x === bounded.x && previous.y === bounded.y)
      return;
    current.current = bounded;
    setView(bounded);
  }, []);

  useEffect(() => {
    const area = stage.current;
    if (!area) return;
    const observer = new ResizeObserver(() => applyView(current.current));
    observer.observe(area);
    const activePointers = pointers.current;
    const endGesture = () => {
      const ids = [...activePointers.keys()];
      activePointers.clear();
      press.current = lastTap.current = null;
      for (const id of ids) if (area.hasPointerCapture(id)) area.releasePointerCapture(id);
    };
    window.addEventListener("blur", endGesture);
    return () => {
      observer.disconnect();
      window.removeEventListener("blur", endGesture);
    };
  }, [applyView]);

  function zoomTo(scale: number, from?: Point, to = from) {
    const area = stage.current;
    if (!area) return;
    const previous = current.current;
    const bounded = clamp(scale, 1, maxScale);
    if (bounded === 1) return applyView(fittedView);
    const ratio = bounded / previous.scale;
    const bounds = area.getBoundingClientRect();
    const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const anchor = from ?? center;
    const target = to ?? center;
    // Keep the same point of the photo under the pinch midpoint as the fingers move.
    applyView({
      scale: bounded,
      x: target.x - center.x - (anchor.x - center.x - previous.x) * ratio,
      y: target.y - center.y - (anchor.y - center.y - previous.y) * ratio,
    });
  }

  function pan(dx: number, dy: number) {
    const previous = current.current;
    applyView({ ...previous, x: previous.x + dx, y: previous.y + dy });
  }

  function startPointer(event: PointerEvent<HTMLDivElement>) {
    const active = pointers.current;
    if (!ready || event.button !== 0 || active.size === 2) return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    active.set(event.pointerId, point);
    if (active.size === 1) press.current = { point, time: event.timeStamp, moved: false };
    else press.current = lastTap.current = null;
  }

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    const active = pointers.current;
    const previous = active.get(event.pointerId);
    if (!previous) return;
    const next = pointerPosition(event);
    active.set(event.pointerId, next);
    if (press.current && distance(press.current.point, next) > 12) press.current.moved = true;
    const [first, second] = active.values();
    const partner = first === next ? second : first;
    if (partner) {
      const ratio = Math.max(8, distance(next, partner)) / Math.max(8, distance(previous, partner));
      zoomTo(current.current.scale * ratio, midpoint(previous, partner), midpoint(next, partner));
    } else if (current.current.scale > 1) {
      pan(next.x - previous.x, next.y - previous.y);
    }
  }

  function releasePointer(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    const start = press.current;
    press.current = null;
    if (!start) return;
    const point = pointerPosition(event);
    const dx = point.x - start.point.x;
    const dy = point.y - start.point.y;
    const previous = lastTap.current;
    lastTap.current = null;
    if (
      event.pointerType !== "mouse" &&
      current.current.scale === 1 &&
      Math.abs(dx) >= 48 &&
      Math.abs(dx) > Math.abs(dy) * 1.5
    ) {
      onMove?.(dx < 0 ? 1 : -1);
    } else if (
      !start.moved &&
      distance(start.point, point) <= 12 &&
      event.timeStamp - start.time <= 300
    ) {
      if (
        previous &&
        event.timeStamp - previous.time <= 320 &&
        distance(previous.point, point) <= 28
      )
        zoomTo(current.current.scale === 1 ? 2.5 : 1, point);
      else lastTap.current = { point, time: event.timeStamp };
    }
  }

  function cancelPointer(event: PointerEvent<HTMLDivElement>) {
    if (pointers.current.delete(event.pointerId)) press.current = lastTap.current = null;
  }

  return {
    stage,
    image,
    view,
    atMax: view.scale === maxScale,
    zoomIn: () => zoomTo(current.current.scale * 1.5),
    zoomOut: () => zoomTo(current.current.scale / 1.5),
    reset: () => zoomTo(1),
    pan,
    pointerHandlers: {
      onPointerDown: startPointer,
      onPointerMove: movePointer,
      onPointerUp: releasePointer,
      onPointerCancel: cancelPointer,
      onLostPointerCapture: cancelPointer,
    },
  };
}
