"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Pencil, Plus, Clock3, GripVertical, MousePointer2, X } from "lucide-react";
import { RecordLink } from "@/components/record-link";
import { value } from "@/shared/client-api";
import type { DomainRecord, Member } from "@/shared/contracts";
import {
  maskPlanActorNames,
  maskPlanBlockLabel,
  maskPlanClock,
  maskPlanStaffNames,
  maskPlanWindow,
  type MaskPlanBlock,
  type MaskPlanData,
  type MaskPlanLane,
} from "../model";
import { maskPlanTracks } from "../layout";
import styles from "./mask-plans.module.css";

function laneTitle(lane: MaskPlanLane, members: Member[], index: number) {
  return maskPlanStaffNames(lane, members).join(" / ") || lane.label || `Spalte ${index + 1}`;
}

function colorStyle(block: MaskPlanBlock, productionColor: string) {
  const color = block.color || productionColor;
  return {
    "--block-color": /^#[0-9a-f]{6}$/i.test(color) ? color : "#83c6a5",
  } as React.CSSProperties;
}

type Props = {
  plan: MaskPlanData;
  members: Member[];
  actors: DomainRecord[];
  performanceTime: string;
  productionColor: string;
  onEditLane: (lane: MaskPlanLane) => void;
  onEditBlock: (block: MaskPlanBlock) => void;
  onAddBlock: (laneId: string, startMinutes?: number) => void;
  onMoveBlock: (id: string, laneId: string, startMinutes: number) => void;
  onDragStart: () => void;
  onDragCancel: () => void;
};

type DragSource = { block?: MaskPlanBlock; plan: MaskPlanData; grabOffset: number };
type DropTarget = { laneId: string; startMinutes: number; durationMinutes: number };
type Point = { x: number; y: number };
const NEW_BLOCK = "new-mask-block";

function eventPoint(event: Event): Point | null {
  if ("touches" in event) {
    const touch = (event as TouchEvent).touches[0] || (event as TouchEvent).changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return "clientX" in event
    ? { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }
    : null;
}

function PlaceControl({
  active,
  onClick,
  onPress,
}: {
  active: boolean;
  onClick: () => void;
  onPress: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: NEW_BLOCK });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      className={`button ${styles.placeControl} ${isDragging ? styles.dragging : ""}`}
      aria-pressed={active}
      onClick={onClick}
      onPointerDownCapture={onPress}
      title="Ziehen oder antippen und danach eine freie Stelle in der Tabelle wählen."
    >
      {active ? <X size={16} /> : <MousePointer2 size={16} />}
      {active ? "Platzieren abbrechen" : "Zeitblock platzieren"}
      <GripVertical size={15} aria-hidden="true" />
    </button>
  );
}

function DraggableBlock({
  block,
  label,
  style,
  performanceTime,
  onClick,
  onPress,
}: {
  block: MaskPlanBlock;
  label: string;
  style: React.CSSProperties;
  performanceTime: string;
  onClick: () => void;
  onPress: () => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: block.id,
    data: { block },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${styles.block} ${isDragging ? styles.dragging : ""}`}
      onClick={onClick}
      onPointerDownCapture={onPress}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={`${label}, ${block.startMinutes} Minuten vor Beginn, ${block.durationMinutes} Minuten, bearbeiten`}
      title={`${label}\n${block.startMinutes} bis ${block.startMinutes + block.durationMinutes} Min.\n${block.notes}\nZiehen zum Verschieben · auf dem Handy kurz halten.`}
      data-mask-block={block.id}
      style={style}
    >
      <span className={styles.blockTime}>
        {block.startMinutes} <span>· {block.durationMinutes} Min.</span>
        <GripVertical size={13} aria-hidden="true" />
      </span>
      <strong>{label}</strong>
      {performanceTime && (
        <span className={styles.blockClock}>
          {maskPlanClock(block.startMinutes, performanceTime)}
        </span>
      )}
      {block.notes && <span className={styles.blockNotes}>{block.notes}</span>}
    </button>
  );
}

export function Timetable({
  plan,
  members,
  actors,
  performanceTime,
  productionColor,
  onEditLane,
  onEditBlock,
  onAddBlock,
  onMoveBlock,
  onDragStart,
  onDragCancel,
}: Props) {
  const board = useRef<HTMLDivElement>(null);
  const point = useRef<Point | null>(null);
  const suppressClick = useRef({ id: "", until: 0 });
  const [placing, setPlacing] = useState(false);
  const [drag, setDrag] = useState<DragSource | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const displayPlan = drag?.plan || plan;
  const window = maskPlanWindow(displayPlan);
  const smallest = Math.min(
    displayPlan.stepMinutes,
    ...displayPlan.blocks.map((block) => block.durationMinutes),
  );
  const minuteHeight = 44 / Math.max(1, smallest);
  const height = -window.start * minuteHeight;
  const laneTracks = new Map(
    displayPlan.lanes.map((lane) => [
      lane.id,
      maskPlanTracks(displayPlan.blocks.filter((block) => block.laneId === lane.id)),
    ]),
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
  );
  const locateTarget = (source: DragSource | null, location: Point | null): DropTarget | null => {
    const element = board.current;
    if (!element || !location) return null;
    const viewport = element.getBoundingClientRect();
    const headerHeight =
      element.querySelector<HTMLElement>("[data-mask-header]")?.offsetHeight || 96;
    const bottomHeight = element.querySelector<HTMLElement>("[data-mask-zero]")?.offsetHeight || 54;
    if (
      location.x <= viewport.left ||
      location.x >= viewport.right ||
      location.y < viewport.top + headerHeight ||
      location.y >= viewport.bottom - bottomHeight
    )
      return null;
    for (const lane of element.querySelectorAll<HTMLElement>("[data-mask-lane]")) {
      const rect = lane.getBoundingClientRect();
      if (
        location.x < rect.left ||
        location.x >= rect.right ||
        location.y < rect.top ||
        location.y >= rect.bottom
      )
        continue;
      // A sticky time rail can cover part of a lane after sideways scrolling.
      const rail = element.querySelector<HTMLElement>("[data-mask-rail]")?.getBoundingClientRect();
      if (rail && location.x < rail.right) return null;
      const raster = displayPlan.stepMinutes;
      const raw = window.start + (location.y - rect.top - (source?.grabOffset || 0)) / minuteHeight;
      const latestStart = source?.block
        ? -Math.ceil(source.block.durationMinutes / raster) * raster
        : -raster;
      const startMinutes = Math.max(
        window.start,
        Math.min(latestStart, Math.round(raw / raster) * raster),
      );
      return {
        laneId: lane.dataset.maskLane!,
        startMinutes,
        durationMinutes: source?.block?.durationMinutes || Math.min(15, -startMinutes),
      };
    }
    return null;
  };
  const locate = useRef(locateTarget);
  useEffect(() => {
    locate.current = locateTarget;
  });
  useEffect(() => {
    if (!drag) return;
    const update = (event: Event) => {
      point.current = eventPoint(event);
      const next = locate.current(drag, point.current);
      setTarget((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    document.addEventListener("mousemove", update, true);
    document.addEventListener("touchmove", update, true);
    let frame = 0;
    let edge = { direction: "", since: 0 };
    const scroll = () => {
      const element = board.current,
        location = point.current;
      if (element && location) {
        const rect = element.getBoundingClientRect();
        if (
          location.x >= rect.left &&
          location.x <= rect.right &&
          location.y >= rect.top &&
          location.y <= rect.bottom
        ) {
          const top =
            rect.top +
            (element.querySelector<HTMLElement>("[data-mask-header]")?.offsetHeight || 96);
          const bottom =
            rect.bottom -
            (element.querySelector<HTMLElement>("[data-mask-zero]")?.offsetHeight || 54);
          const horizontal =
            location.x < rect.left + 32 ? -10 : location.x > rect.right - 32 ? 10 : 0;
          const vertical = location.y < top + 24 ? -10 : location.y > bottom - 24 ? 10 : 0;
          const direction = `${horizontal}:${vertical}`;
          if (edge.direction !== direction) edge = { direction, since: Date.now() };
          // Crossing a header or edge should not scroll the table; hovering there should.
          if ((horizontal || vertical) && Date.now() - edge.since > 250) {
            element.scrollBy(horizontal, vertical);
            const next = locate.current(drag, location);
            setTarget((current) =>
              JSON.stringify(current) === JSON.stringify(next) ? current : next,
            );
          }
        } else edge = { direction: "", since: 0 };
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => {
      document.removeEventListener("mousemove", update, true);
      document.removeEventListener("touchmove", update, true);
      cancelAnimationFrame(frame);
    };
  }, [drag]);
  const startDrag = (event: DragStartEvent) => {
    const block = event.active.data.current?.block as MaskPlanBlock | undefined;
    point.current = eventPoint(event.activatorEvent);
    const next = {
      block,
      plan,
      grabOffset:
        block && point.current
          ? Math.max(
              0,
              point.current.y - (event.active.rect.current.initial?.top || point.current.y),
            )
          : 0,
    };
    onDragStart();
    suppressClick.current = { id: String(event.active.id), until: Infinity };
    setPlacing(false);
    setDrag(next);
    setTarget(locateTarget(next, point.current));
  };
  const finishDrag = (cancelled = false) => {
    const drop = cancelled ? null : locateTarget(drag, point.current);
    suppressClick.current.until = Date.now() + 500;
    if (drop) {
      if (drag?.block) onMoveBlock(drag.block.id, drop.laneId, drop.startMinutes);
      else onAddBlock(drop.laneId, drop.startMinutes);
    }
    onDragCancel();
    setDrag(null);
    setTarget(null);
    point.current = null;
  };
  const mayClick = (id: string) =>
    suppressClick.current.id !== id || Date.now() > suppressClick.current.until;
  const beginPress = () => {
    // A new deliberate press is different from the synthetic click following a drop.
    if (Number.isFinite(suppressClick.current.until)) suppressClick.current = { id: "", until: 0 };
  };
  const targetLane = displayPlan.lanes.findIndex((lane) => lane.id === target?.laneId);
  return (
    <DndContext
      sensors={sensors}
      autoScroll={false}
      onDragStart={startDrag}
      onDragEnd={() => finishDrag()}
      onDragCancel={() => finishDrag(true)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Zum Bearbeiten antippen oder Enter drücken. Verschieben ist auch über die Felder Personalspalte und Minuten vor Beginn möglich.",
        },
      }}
    >
      <div className={styles.placementBar}>
        <PlaceControl
          active={placing}
          onPress={beginPress}
          onClick={() => {
            if (mayClick(NEW_BLOCK)) setPlacing(!placing);
          }}
        />
        <p className={styles.scrollHint}>
          {placing
            ? "Tippe auf eine freie Stelle für den neuen Zeitblock."
            : "Blöcke ziehen · auf dem Handy kurz halten und verschieben. Antippen öffnet die Einstellungen."}
        </p>
      </div>
      <span className={styles.dragAnnouncement} role="status" aria-live="polite">
        {target
          ? `${target.startMinutes} Minuten · ${laneTitle(displayPlan.lanes[targetLane], members, targetLane)}`
          : drag
            ? "Zum Abbrechen außerhalb der Tabelle loslassen."
            : ""}
      </span>
      <div
        ref={board}
        className={`${styles.timelineScroll} ${placing ? styles.placing : ""} ${drag ? styles.dragActive : ""}`}
        tabIndex={0}
        role="region"
        aria-label="Maskenplan-Zeittabelle, horizontal und vertikal scrollbar"
      >
        <div
          className={styles.sheet}
          style={{
            gridTemplateColumns: `var(--time-rail) repeat(${displayPlan.lanes.length}, minmax(var(--lane-width), 1fr))`,
          }}
        >
          <div className={styles.corner}>
            <span>MIN.</span>
            {performanceTime && <Clock3 size={15} aria-label="Uhrzeiten" />}
          </div>
          {displayPlan.lanes.map((lane, index) => (
            <header key={lane.id} className={styles.laneHeader} data-mask-header>
              <button
                type="button"
                onClick={() => onEditLane(lane)}
                className={styles.laneTitle}
                aria-label={`Personalspalte bearbeiten: ${laneTitle(lane, members, index)}`}
              >
                {lane.label && maskPlanStaffNames(lane, members).length > 0 && (
                  <span>{lane.label}</span>
                )}
                <strong>{laneTitle(lane, members, index)}</strong>
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => onAddBlock(lane.id)}
                className={styles.laneAdd}
                aria-label={`Zeitblock hinzufügen bei ${laneTitle(lane, members, index)}`}
              >
                <Plus size={15} />
                Zeitblock
              </button>
            </header>
          ))}
          <div className={styles.timeRail} style={{ height }} data-mask-rail>
            {window.ticks
              .filter((tick) => tick !== 0)
              .map((tick) => (
                <div
                  key={tick}
                  className={styles.tick}
                  style={{ top: (tick - window.start) * minuteHeight }}
                >
                  <strong>{tick}</strong>
                  {performanceTime && (
                    <span title={maskPlanClock(tick, performanceTime)}>
                      {maskPlanClock(tick, performanceTime)}
                    </span>
                  )}
                </div>
              ))}
          </div>
          {displayPlan.lanes.map((lane) => (
            <div
              key={lane.id}
              className={styles.laneBody}
              data-mask-lane={lane.id}
              onClick={(event) => {
                if (
                  !placing ||
                  event.button !== 0 ||
                  (event.target instanceof Element && event.target.closest("button"))
                )
                  return;
                const drop = locateTarget(null, { x: event.clientX, y: event.clientY });
                if (drop) {
                  setPlacing(false);
                  onAddBlock(drop.laneId, drop.startMinutes);
                }
              }}
              style={
                {
                  height,
                  "--tick-height": `${displayPlan.stepMinutes * minuteHeight}px`,
                } as React.CSSProperties
              }
            >
              {!displayPlan.blocks.some((block) => block.laneId === lane.id) && (
                <button
                  type="button"
                  className={styles.emptyLane}
                  onClick={() => onAddBlock(lane.id)}
                >
                  <Plus size={18} />
                  <span>Ersten Zeitblock hinzufügen</span>
                </button>
              )}
              {target?.laneId === lane.id && (
                <div
                  className={styles.dropTarget}
                  aria-hidden="true"
                  style={{
                    top: (target.startMinutes - window.start) * minuteHeight,
                    height: target.durationMinutes * minuteHeight,
                  }}
                >
                  <strong>
                    {target.startMinutes} · {target.durationMinutes} Min.
                  </strong>
                  <span>{drag?.block ? "Hierhin verschieben" : "Hier Zeitblock anlegen"}</span>
                </div>
              )}
              {displayPlan.blocks
                .filter((block) => block.laneId === lane.id)
                .map((block) => {
                  const { track, count } = laneTracks.get(lane.id)!.get(block.id)!;
                  const label = maskPlanBlockLabel(block, actors);
                  return (
                    <DraggableBlock
                      key={block.id}
                      block={block}
                      label={label}
                      performanceTime={performanceTime}
                      onClick={() => {
                        if (mayClick(block.id)) onEditBlock(block);
                      }}
                      onPress={beginPress}
                      style={{
                        ...colorStyle(block, productionColor),
                        top: (block.startMinutes - window.start) * minuteHeight,
                        height: block.durationMinutes * minuteHeight,
                        left: `calc(${(track / count) * 100}% + 5px)`,
                        width: `calc(${100 / count}% - 10px)`,
                      }}
                    />
                  );
                })}
            </div>
          ))}
          <div className={styles.zeroRail} data-mask-zero>
            <strong>0</strong>
            {performanceTime && <span>{performanceTime}</span>}
          </div>
          {displayPlan.lanes.map((lane) => (
            <div key={lane.id} className={styles.begin}>
              <span>BEGINN</span>
            </div>
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
        {drag && (
          <div className={styles.dragGhost}>
            <GripVertical size={16} />
            <strong>
              {drag.block ? maskPlanBlockLabel(drag.block, actors) : "Neuer Zeitblock"}
            </strong>
            <span>
              {target
                ? `${target.startMinutes} Min. · ${target.durationMinutes} Min.`
                : "In einer Personalspalte ablegen"}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export function PlanAgenda({
  plan,
  members,
  actors,
  performanceTime,
  productionColor,
  onEditLane,
  onEditBlock,
  onAddBlock,
}: Props) {
  return (
    <div className={styles.agenda}>
      {plan.lanes.map((lane, laneIndex) => {
        const blocks = plan.blocks
          .filter((block) => block.laneId === lane.id)
          .sort((left, right) => left.startMinutes - right.startMinutes);
        return (
          <section key={lane.id} className={styles.agendaLane}>
            <header className={styles.agendaHeading}>
              <button type="button" onClick={() => onEditLane(lane)} className={styles.agendaStaff}>
                <strong>{laneTitle(lane, members, laneIndex)}</strong>
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Zeitblock hinzufügen bei ${laneTitle(lane, members, laneIndex)}`}
                onClick={() => onAddBlock(lane.id)}
              >
                <Plus size={18} />
              </button>
            </header>
            {blocks.length ? (
              <ol className={styles.agendaBlocks}>
                {blocks.map((block) => (
                  <li key={block.id} style={colorStyle(block, productionColor)}>
                    <div className={styles.agendaTime}>
                      <strong>{block.startMinutes}</strong>
                      <span>{block.durationMinutes} Min.</span>
                      {performanceTime && (
                        <small>{maskPlanClock(block.startMinutes, performanceTime)}</small>
                      )}
                    </div>
                    <div className={styles.agendaText}>
                      <div className={styles.actorLinks}>
                        {block.actorIds.map((id) => {
                          const actor = actors.find((actor) => actor.id === id);
                          return actor ? (
                            <RecordLink key={id} record={actor}>
                              {value(actor.data, "name")}
                            </RecordLink>
                          ) : (
                            <span key={id}>Frühere Schauspielperson</span>
                          );
                        })}
                        {block.actorNames.map((name, index) => (
                          <span key={`${index}:${name}`}>{name}</span>
                        ))}
                      </div>
                      {block.title && <strong>{block.title}</strong>}
                      {block.notes && <p>{block.notes}</p>}
                      {!maskPlanActorNames(block, actors).length && !block.title && (
                        <strong>Zeitblock</strong>
                      )}
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${maskPlanBlockLabel(block, actors)} bearbeiten`}
                      onClick={() => onEditBlock(block)}
                    >
                      <Pencil size={17} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.agendaEmpty}>Noch keine Zeitblöcke.</p>
            )}
          </section>
        );
      })}
      <div className={styles.agendaBegin}>
        <strong>0 · Vorstellungsbeginn</strong>
        {performanceTime && <span>{performanceTime}</span>}
      </div>
    </div>
  );
}
