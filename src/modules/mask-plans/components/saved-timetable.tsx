"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { LinkedText } from "@/components/linked-text";
import { Pencil } from "lucide-react";
import { RecordLink } from "@/components/record-link";
import { value } from "@/shared/client-api";
import type { DomainRecord, Member } from "@/shared/contracts";
import { maskPlanTracks } from "../layout";
import {
  maskPlanBlockLabel,
  maskPlanClock,
  maskPlanStaffNames,
  maskPlanWindow,
  type MaskPlanBlock,
  type MaskPlanData,
  type MaskPlanLane,
} from "../model";
import type { EveningPerson, EveningView } from "../evening";
import styles from "./mask-plans.module.css";

type Props = {
  plan: MaskPlanData;
  members: Member[];
  actors: DomainRecord[];
  performanceTime: string;
  productionColor: string;
  onEditLane: (lane: MaskPlanLane) => void;
  onEditBlock: (block: MaskPlanBlock) => void;
  /** Guests read the plan: no lane or block editing shortcuts. */
  readOnly?: boolean;
  /** Who works this evening, per lane (view only). */
  evening?: EveningView | null;
  /** Current time in minutes relative to the beginning, inside the plan window. */
  nowMinutes?: number | null;
};

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function SavedAppointment({
  block,
  actors,
  performanceTime,
  onEdit,
}: {
  block: MaskPlanBlock;
  actors: DomainRecord[];
  performanceTime: string;
  onEdit?: () => void;
}) {
  const label = maskPlanBlockLabel(block, actors) || "Zeitblock";
  return (
    <div className={styles.savedAppointment}>
      <div className={styles.savedTiming}>
        <span>
          {block.startMinutes} · {block.durationMinutes} Min.
        </span>
        {performanceTime && <span>{maskPlanClock(block.startMinutes, performanceTime)}</span>}
      </div>
      <div className={styles.savedActors}>
        {block.actorIds.map((id) => {
          const actor = actors.find((candidate) => candidate.id === id);
          return actor ? (
            <RecordLink key={id} record={actor} decoration={false}>
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
      {!block.actorIds.length && !block.actorNames.length && !block.title && (
        <strong>Zeitblock</strong>
      )}
      {block.notes && (
        <p className={styles.savedNotes}>
          <LinkedText>{block.notes}</LinkedText>
        </p>
      )}
      {onEdit && (
        <button
          type="button"
          className={styles.savedAppointmentEdit}
          onClick={onEdit}
          aria-label={`${label}, ${block.startMinutes} Minuten vor Beginn, ${block.durationMinutes} Minuten, bearbeiten`}
          title="Zeitblock bearbeiten"
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
}

/** Natural table rows keep short appointments readable without stretching the entire time range. */
export function SavedTimetable({
  plan,
  members,
  actors,
  performanceTime,
  productionColor,
  onEditLane,
  onEditBlock,
  readOnly = false,
  evening,
  nowMinutes = null,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const nowLine = useRef<HTMLDivElement>(null);
  const memberName = (id: string) =>
    members.find((member) => member.id === id)?.name || "Unbekannte Maskenperson";
  const { start } = maskPlanWindow(plan);
  const interval = Math.max(
    plan.stepMinutes,
    Math.ceil(-start / (12 * plan.stepMinutes)) * plan.stepMinutes,
  );
  const points = [start, 0];
  for (let minute = start + interval; minute < 0; minute += interval) points.push(minute);
  for (const block of plan.blocks)
    points.push(block.startMinutes, block.startMinutes + block.durationMinutes);
  const boundaries = [...new Set(points)].sort((a, b) => a - b);
  const lanes = plan.lanes.map((lane, index) => {
    const blocks = plan.blocks.filter((block) => block.laneId === lane.id);
    const positions = maskPlanTracks(blocks);
    const count = Math.max(1, ...[...positions.values()].map((position) => position.count));
    const names = maskPlanStaffNames(lane, members);
    const tonight = evening?.lanes.get(lane.id);
    return {
      lane,
      blocks,
      positions,
      count,
      names,
      title: names.join(" / ") || lane.label || `Spalte ${index + 1}`,
      people: evening?.staffed ? tonight?.people : undefined,
      mine: !!tonight?.mine,
    };
  });
  const mineKey = lanes
    .filter((lane) => lane.mine)
    .map((lane) => lane.lane.id)
    .join();
  // Smartphone: bring my lane into view once, without motion when reduced motion is requested.
  useEffect(() => {
    const box = container.current;
    const header = mineKey ? box?.querySelector<HTMLElement>("th[data-mine]") : null;
    if (!box || !header || box.scrollWidth <= box.clientWidth) return;
    const rail = box.querySelector<HTMLElement>("thead th")?.offsetWidth || 0;
    box.scrollTo({
      left: Math.max(0, header.offsetLeft - rail - 8),
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }, [mineKey]);
  const boundaryKey = boundaries.join();
  // The rows have natural heights, so the "jetzt" line is placed from the measured rows.
  useLayoutEffect(() => {
    const box = container.current;
    const line = nowLine.current;
    if (!box || !line || nowMinutes === null) return;
    const place = () => {
      const table = box.querySelector("table");
      const rows = [...box.querySelectorAll<HTMLTableRowElement>("tbody tr, tfoot tr")];
      const marks = boundaryKey.split(",").map(Number);
      const index = marks.findIndex(
        (mark, position) => nowMinutes >= mark && nowMinutes < (marks[position + 1] ?? 1),
      );
      const row = rows[Math.max(0, index)];
      if (!table || !row || index < 0) return;
      const from = marks[index],
        to = marks[index + 1] ?? from;
      const share = to > from ? (nowMinutes - from) / (to - from) : 0;
      const top = table.offsetTop + row.offsetTop + share * row.offsetHeight;
      line.style.transform = `translateY(${Math.round(top)}px)`;
      line.style.width = `${table.offsetWidth}px`;
      line.hidden = false;
    };
    place();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    observer?.observe(box);
    return () => observer?.disconnect();
  }, [nowMinutes, boundaryKey]);
  const personLabel = (person: EveningPerson) => (
    <span key={`${person.id}:${person.replaces || ""}`} data-status={person.status}>
      <span>{memberName(person.id)}</span>
      {person.status === "absent" && <em>nicht eingeteilt</em>}
      {person.status === "cover" && person.replaces && <em>für {memberName(person.replaces)}</em>}
    </span>
  );
  const railWidth = performanceTime ? 56 : 44;
  const minimumWidth = lanes.reduce(
    (total, lane) => total + Math.max(124, lane.count * 100),
    railWidth,
  );
  const preferredWidth = Math.max(320, lanes.length * 250 + railWidth, minimumWidth);

  return (
    <div
      ref={container}
      className={styles.savedTimetable}
      style={
        {
          "--time-rail": `${railWidth}px`,
          "--saved-min-width": `${minimumWidth}px`,
          "--saved-preferred-width": `${preferredWidth}px`,
        } as CSSProperties
      }
      data-compact="true"
      tabIndex={0}
      role="region"
      aria-label="Maskenplan-Zeittabelle, horizontal und vertikal scrollbar"
    >
      <table className={styles.savedSheet} aria-label={`Maskenplan: ${plan.title}`}>
        <colgroup>
          <col className={styles.savedRailColumn} />
        </colgroup>
        {lanes.map(({ lane, count }) => (
          <colgroup key={lane.id}>
            {Array.from({ length: count }, (_, index) => (
              <col
                key={index}
                style={{ width: `calc((100% - var(--time-rail)) / ${lanes.length * count})` }}
              />
            ))}
          </colgroup>
        ))}
        <thead>
          <tr>
            <th className={styles.savedCorner} scope="col">
              MIN.
            </th>
            {lanes.map(({ lane, count, names, title, people, mine }) => {
              const absent = people?.some((person) => person.status === "absent");
              const content = (
                <>
                  {lane.label && (names.length > 0 || !!people?.length) && (
                    <span>{lane.label}</span>
                  )}
                  {people?.length ? (
                    <strong className={styles.eveningStaff}>
                      {people.map(personLabel)}
                      {lane.staffNames.map((name) => (
                        <span key={`free:${name}`}>{name}</span>
                      ))}
                    </strong>
                  ) : (
                    <strong>{title}</strong>
                  )}
                  {mine && <span className={styles.mineTag}>Meine Spalte</span>}
                </>
              );
              return (
                <th
                  key={lane.id}
                  colSpan={count}
                  scope="colgroup"
                  data-mask-header
                  data-mine={mine || undefined}
                  data-absent={absent || undefined}
                >
                  {readOnly ? (
                    <div className={styles.savedStaff}>{content}</div>
                  ) : (
                    <button
                      type="button"
                      className={styles.savedStaff}
                      onClick={() => onEditLane(lane)}
                      aria-label={`Personalspalte bearbeiten: ${title}`}
                    >
                      {content}
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {boundaries.slice(0, -1).map((minute, rowIndex) => (
            <tr key={minute}>
              <th className={`${styles.timeRail} ${styles.savedTime}`} scope="row" data-mask-rail>
                <strong>{minute}</strong>
                {performanceTime && <span>{maskPlanClock(minute, performanceTime)}</span>}
              </th>
              {lanes.flatMap(({ lane, count, blocks, positions, mine }) => {
                const cells = [];
                for (let track = 0; track < count; track++) {
                  const block = blocks.find((candidate) => {
                    if (
                      candidate.startMinutes > minute ||
                      candidate.startMinutes + candidate.durationMinutes <= minute
                    )
                      return false;
                    const position = positions.get(candidate.id)!;
                    return position.count === 1 || position.track === track;
                  });
                  if (block && block.startMinutes !== minute) continue;
                  const span = block && positions.get(block.id)!.count === 1 ? count : 1;
                  if (block) {
                    const color = block.color || productionColor;
                    cells.push(
                      <td
                        key={`${lane.id}:${track}`}
                        data-mask-block={block.id}
                        rowSpan={boundaries.indexOf(minute + block.durationMinutes) - rowIndex}
                        colSpan={span}
                        data-mine={mine || undefined}
                        className={styles.savedCell}
                        style={
                          {
                            "--block-color": /^#[0-9a-f]{6}$/i.test(color) ? color : "#83c6a5",
                          } as CSSProperties
                        }
                      >
                        <SavedAppointment
                          block={block}
                          actors={actors}
                          performanceTime={performanceTime}
                          onEdit={readOnly ? undefined : () => onEditBlock(block)}
                        />
                      </td>,
                    );
                  } else
                    cells.push(
                      <td
                        key={`${lane.id}:${track}`}
                        aria-hidden="true"
                        data-mine={mine || undefined}
                      />,
                    );
                  track += span - 1;
                }
                return cells;
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className={`${styles.timeRail} ${styles.savedZero}`} scope="row" data-mask-zero>
              <strong>0</strong>
              {performanceTime && <span>{performanceTime}</span>}
            </th>
            {lanes.map(({ lane, count }) => (
              <td key={lane.id} colSpan={count} className={styles.savedBegin}>
                Beginn
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      {nowMinutes !== null && (
        <div ref={nowLine} className={styles.nowLine} hidden aria-hidden="true">
          <span>jetzt</span>
        </div>
      )}
    </div>
  );
}
