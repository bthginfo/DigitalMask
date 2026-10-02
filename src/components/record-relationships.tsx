"use client";

import { useState } from "react";
import { Badge } from "./ui";
import { PeriodPicker } from "./period-picker";
import { RecordLink } from "./record-link";
import { useWorkspace } from "./workspace-context";
import { textValue, type DomainRecord } from "@/shared/contracts";
import {
  actorLooks,
  actorName,
  actorProductions,
  castingActor,
  castingCharacter,
  characterCastings,
  characterName,
  personProductions,
  relatedProduction,
} from "@/shared/record-relationships";
import { seasonForDate, type PeriodFilter } from "@/shared/period-filter";
import styles from "./record-links.module.css";

type RelationshipProps = { record: DomainRecord; onNavigate?: () => void };

function useRelationshipPeriod(record: DomainRecord) {
  const { workspace } = useWorkspace();
  const [period, setPeriod] = useState<PeriodFilter>(() => {
    const query = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
    const selected = query.get("record") === record.id ? query.get("relatedSeason") : null;
    const year = Number(query.get("relatedYear"));
    return {
      season:
        selected === "all" ? undefined : selected || seasonForDate(workspace.records.productions),
      year: year >= 1900 && year <= 2100 ? year : undefined,
    };
  });
  const update = (next: PeriodFilter) => {
    setPeriod(next);
    const url = new URL(location.href);
    if (url.searchParams.get("record") !== record.id) return;
    url.searchParams.set("relatedSeason", next.season || "all");
    if (next.year) url.searchParams.set("relatedYear", String(next.year));
    else url.searchParams.delete("relatedYear");
    history.replaceState({}, "", url.pathname + url.search);
  };
  return [period, update] as const;
}

export function ActorRelationships({ record, onNavigate }: RelationshipProps) {
  const { workspace } = useWorkspace();
  const [period, setPeriod] = useRelationshipPeriod(record);
  const appearances = actorProductions(record.id, workspace, period);
  const looks = actorLooks(record.id, workspace, period);
  const link = { from: record, onNavigate };
  return (
    <section
      className={styles.section}
      aria-label="Produktionen und Aufschriebe dieser Schauspielperson"
    >
      <div className={styles.heading}>
        <h3>Spielt mit in</h3>
        <span className="small muted">
          {appearances.length} {appearances.length === 1 ? "Produktion" : "Produktionen"}
        </span>
      </div>
      <div className={styles.filter}>
        <PeriodPicker
          records={workspace.records.casting}
          productions={workspace.records.productions}
          value={period}
          onChange={setPeriod}
          compact
        />
      </div>
      {appearances.length ? (
        <ul className={styles.list}>
          {appearances.map(({ production, castings }) => (
            <li key={production.id} className={styles.row}>
              <div className={styles.rowHeader}>
                <RecordLink record={production} {...link}>
                  {textValue(production.data.title)}
                </RecordLink>
                <span>{textValue(production.data.season) || "Spielzeit nicht hinterlegt"}</span>
              </div>
              {castings.map((casting) => {
                const character = castingCharacter(casting, workspace);
                return (
                  <div className={styles.role} key={casting.id}>
                    <span className={styles.roleDetails}>
                      {character ? (
                        <RecordLink record={character} {...link}>
                          {characterName(casting, workspace)}
                        </RecordLink>
                      ) : (
                        characterName(casting, workspace)
                      )}
                      {casting.data.alternate === true && <Badge>Alternierend</Badge>}
                    </span>
                    <RecordLink record={casting} {...link}>
                      Besetzung öffnen
                    </RecordLink>
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          Für diesen Zeitraum ist noch keine Besetzung verknüpft. Wähle eine andere oder alle
          Spielzeiten, um ältere Produktionen zu sehen.
        </p>
      )}
      <div className={`${styles.heading} margin-top`}>
        <h3>Aufschriebe</h3>
        <span className="small muted">{looks.length}</span>
      </div>
      {looks.length ? (
        <ul className={styles.list}>
          {looks.map((look) => {
            const production = relatedProduction(look, workspace);
            const figure = workspace.records.characters.find(
              (character) => character.id === look.data.characterId,
            );
            return (
              <li key={look.id} className={styles.row}>
                <RecordLink record={look} {...link}>
                  {production ? textValue(production.data.title) : "Allgemeiner Aufschrieb"}
                  {(!!figure || !!textValue(look.data.characterName)) &&
                    ` · ${textValue(figure?.data.name) || textValue(look.data.characterName)}`}
                </RecordLink>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.caption}>Noch keine verknüpften Aufschriebe in diesem Zeitraum.</p>
      )}
    </section>
  );
}

export function CharacterRelationships({ record, onNavigate }: RelationshipProps) {
  const { workspace } = useWorkspace();
  const castings = characterCastings(record.id, workspace);
  return (
    <section className={styles.section}>
      <h3>Besetzung dieser Figur</h3>
      {castings.length ? (
        <ul className={styles.list}>
          {castings.map((casting) => {
            const actor = castingActor(casting, workspace);
            return (
              <li key={casting.id} className={styles.row}>
                <div className={styles.rowHeader}>
                  {actor ? (
                    <RecordLink record={actor} from={record} onNavigate={onNavigate}>
                      {actorName(casting, workspace)}
                    </RecordLink>
                  ) : (
                    <span>{actorName(casting, workspace)}</span>
                  )}
                  {casting.data.alternate === true && <Badge>Alternierend</Badge>}
                </div>
                <RecordLink record={casting} from={record} onNavigate={onNavigate}>
                  Besetzung & Bilder öffnen
                </RecordLink>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>Dieser Figur ist noch keine Schauspielperson zugeordnet.</p>
      )}
    </section>
  );
}

export function PersonRelationships({ record, onNavigate }: RelationshipProps) {
  const { workspace } = useWorkspace();
  const [period, setPeriod] = useRelationshipPeriod(record);
  const appearances = personProductions(record.id, workspace, period);
  return (
    <section className={styles.section}>
      <h3>Mitwirkende Produktionen</h3>
      <div className={styles.filter}>
        <PeriodPicker
          records={workspace.records.productions}
          productions={workspace.records.productions}
          value={period}
          onChange={setPeriod}
          compact
        />
      </div>
      {appearances.length ? (
        <ul className={styles.list}>
          {appearances.map(({ production, roles }) => (
            <li key={production.id} className={styles.row}>
              <div className={styles.rowHeader}>
                <RecordLink record={production} from={record} onNavigate={onNavigate}>
                  {textValue(production.data.title)}
                </RecordLink>
                <span>{textValue(production.data.season)}</span>
              </div>
              <p className={styles.caption}>{roles.join(" · ") || "Kontakt"}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          In diesem Zeitraum ist keine Produktion verknüpft. Ältere Zuordnungen findest du über die
          Spielzeitauswahl.
        </p>
      )}
    </section>
  );
}

export function SprintRelationships({ record, onNavigate }: RelationshipProps) {
  const { workspace } = useWorkspace();
  const tasks = workspace.records.tasks.filter((task) => task.data.sprintId === record.id);
  return (
    <section className={styles.section}>
      <h3>Aufgaben in diesem Sprint</h3>
      {tasks.length ? (
        <ul className={styles.list}>
          {tasks.map((task) => (
            <li key={task.id} className={styles.row}>
              <RecordLink record={task} from={record} onNavigate={onNavigate}>
                {textValue(task.data.title)}
              </RecordLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.caption}>Diesem Sprint sind noch keine Aufgaben zugeteilt.</p>
      )}
    </section>
  );
}
