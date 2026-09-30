"use client";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { value } from "@/shared/client-api";
import { useWorkspace } from "./workspace-context";
export function CastingImpact({ previous, next }: { previous: DomainRecord; next: RecordData }) {
  const { workspace } = useWorkspace();
  if (
    next.actorId === previous.data.actorId &&
    next.characterId === previous.data.characterId &&
    next.productionId === previous.data.productionId
  )
    return null;
  const figure = workspace.records.characters.find(
    (record) => record.id === previous.data.characterId,
  );
  const oldActor = workspace.records.actors.find((record) => record.id === previous.data.actorId);
  const newActor = workspace.records.actors.find((record) => record.id === next.actorId);
  const looks = workspace.records.looks.filter(
    (record) =>
      record.data.productionId === previous.data.productionId &&
      (record.data.characterId === previous.data.characterId ||
        record.data.actorId === previous.data.actorId),
  );
  const tasks = workspace.records.tasks.filter(
    (record) =>
      record.data.productionId === previous.data.productionId && record.data.status !== "done",
  );
  const events = workspace.records.events.filter(
    (record) =>
      record.data.productionId === previous.data.productionId &&
      String(record.data.end) >= new Date().toISOString(),
  );
  const links = (records: DomainRecord[], module: string) =>
    records.length ? (
      <ul>
        {records.slice(0, 12).map((record) => (
          <li key={record.id}>
            <Link href={`/?module=${module}&record=${record.id}`} target="_blank" prefetch={false}>
              {value(record.data, "title")}
              <ArrowUpRight size={12} />
            </Link>
          </li>
        ))}
        {records.length > 12 && (
          <li className="small muted">{records.length - 12} weitere im jeweiligen Bereich</li>
        )}
      </ul>
    ) : (
      <p className="small muted">Keine betroffenen Einträge.</p>
    );
  return (
    <section className="casting-impact field-wide">
      <header>
        <AlertTriangle size={18} />
        <h3>Besetzungswechsel prüfen</h3>
      </header>
      <p className="small">
        {oldActor ? value(oldActor.data, "name") : "Bisherige Besetzung"} →{" "}
        {newActor ? value(newActor.data, "name") : "Neue Besetzung"} · Figur{" "}
        {figure ? value(figure.data, "name") : "bisherige Figur"}
      </p>
      <p className="small muted">
        Die Besetzung wird geändert. Aufschriebe und Produktionsplanung bleiben erhalten und sollten
        fachlich geprüft werden. Links öffnen in einem neuen Tab.
      </p>
      <h4>Direkt zugeordnete Aufschriebe ({looks.length})</h4>
      {links(looks, "documentation")}
      <h4>Allgemeine Produktionsaufgaben ({tasks.length})</h4>
      <p className="small muted">
        Diese Aufgaben gehören zum Stück; sie sind keiner einzelnen Schauspielerbesetzung
        zugeordnet.
      </p>
      {links(tasks, "tasks")}
      <h4>Anstehende Produktionsdienste ({events.length})</h4>
      <p className="small muted">
        Diese Termine gehören zur Produktion; der Wechsel löst keine automatische Dienständerung
        aus.
      </p>
      {links(events, "calendar")}
    </section>
  );
}
