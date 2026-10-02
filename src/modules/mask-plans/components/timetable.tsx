"use client";

import { Pencil, Plus, Clock3 } from "lucide-react";
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
};

export function Timetable({
  plan,
  members,
  actors,
  performanceTime,
  productionColor,
  onEditLane,
  onEditBlock,
  onAddBlock,
}: Props) {
  const window = maskPlanWindow(plan);
  const smallest = Math.min(plan.stepMinutes, ...plan.blocks.map((block) => block.durationMinutes));
  const minuteHeight = 44 / Math.max(1, smallest);
  const height = -window.start * minuteHeight;
  const laneTracks = new Map(
    plan.lanes.map((lane) => [
      lane.id,
      maskPlanTracks(plan.blocks.filter((block) => block.laneId === lane.id)),
    ]),
  );
  return (
    <>
      <p className={styles.scrollHint}>
        Zeitblöcke antippen · Personalspalten seitlich verschieben.
      </p>
      <div
        className={styles.timelineScroll}
        tabIndex={0}
        role="region"
        aria-label="Maskenplan-Zeittabelle, horizontal und vertikal scrollbar"
      >
        <div
          className={styles.sheet}
          style={{
            gridTemplateColumns: `var(--time-rail) repeat(${plan.lanes.length}, minmax(var(--lane-width), 1fr))`,
          }}
        >
          <div className={styles.corner}>
            <span>MIN.</span>
            {performanceTime && <Clock3 size={15} aria-label="Uhrzeiten" />}
          </div>
          {plan.lanes.map((lane, index) => (
            <header key={lane.id} className={styles.laneHeader}>
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
          <div className={styles.timeRail} style={{ height }}>
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
          {plan.lanes.map((lane) => (
            <div
              key={lane.id}
              className={styles.laneBody}
              style={
                {
                  height,
                  "--tick-height": `${plan.stepMinutes * minuteHeight}px`,
                } as React.CSSProperties
              }
            >
              {!plan.blocks.some((block) => block.laneId === lane.id) && (
                <button
                  type="button"
                  className={styles.emptyLane}
                  onClick={() => onAddBlock(lane.id)}
                >
                  <Plus size={18} />
                  <span>Ersten Zeitblock hinzufügen</span>
                </button>
              )}
              {plan.blocks
                .filter((block) => block.laneId === lane.id)
                .map((block) => {
                  const { track, count } = laneTracks.get(lane.id)!.get(block.id)!;
                  const label = maskPlanBlockLabel(block, actors);
                  return (
                    <button
                      type="button"
                      key={block.id}
                      className={styles.block}
                      onClick={() => onEditBlock(block)}
                      aria-label={`${label}, ${block.startMinutes} Minuten vor Beginn, ${block.durationMinutes} Minuten, bearbeiten`}
                      title={`${label}\n${block.startMinutes} bis ${block.startMinutes + block.durationMinutes} Min.\n${block.notes}`}
                      style={{
                        ...colorStyle(block, productionColor),
                        top: (block.startMinutes - window.start) * minuteHeight,
                        height: block.durationMinutes * minuteHeight,
                        left: `calc(${(track / count) * 100}% + 5px)`,
                        width: `calc(${100 / count}% - 10px)`,
                      }}
                    >
                      <span className={styles.blockTime}>
                        {block.startMinutes} <span>· {block.durationMinutes} Min.</span>
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
                })}
            </div>
          ))}
          <div className={styles.zeroRail}>
            <strong>0</strong>
            {performanceTime && <span>{performanceTime}</span>}
          </div>
          {plan.lanes.map((lane) => (
            <div key={lane.id} className={styles.begin}>
              <span>BEGINN</span>
            </div>
          ))}
        </div>
      </div>
    </>
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
