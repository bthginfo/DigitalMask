"use client";
import { useId, useMemo, useState } from "react";
import { ArrowUpRight, Plus, Search, UsersRound } from "lucide-react";
import { Button, Empty, ExportButton, PageHeader } from "@/components/ui";
import { RecordLink } from "@/components/record-link";
import { ExportDialog } from "@/components/export-dialog";
import { useWorkspace } from "@/components/workspace-context";
import { textValue } from "@/shared/contracts";
import { canManageRecord } from "@/shared/record-permissions";
import { PersonEditor } from "./person-editor";
import { PersonContactLinks } from "./person-contact-links";
import { filterPeople, isDirectoryPerson } from "./person-data";
import styles from "./people.module.css";

type Panel = { type: "create" | "export" } | null;
export function PeopleModule() {
  const { workspace, busy, online } = useWorkspace();
  const [query, setQuery] = useState(""),
    [organization, setOrganization] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const id = useId(),
    canManage = canManageRecord(workspace.user, "people");
  const people = useMemo(
    () => workspace.records.people.filter(isDirectoryPerson),
    [workspace.records.people],
  );
  const organizations = useMemo(
    () =>
      Array.from(
        new Set(people.map((person) => textValue(person.data.organization)).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "de")),
    [people],
  );
  const filtered = useMemo(
    () => filterPeople(people, query, organization),
    [people, query, organization],
  );
  const open = (next: Panel) => {
    setPanel(next);
  };
  const close = () => {
    open(null);
  };
  return (
    <section className={styles.directory}>
      <PageHeader
        eyebrow="Kontakte"
        title="Ansprechpersonen"
        description="Ansprechpersonen für eure Zusammenarbeit – mit Funktion, Organisation und Kontaktdaten."
      >
        <ExportButton onClick={() => open({ type: "export" })} />
        {canManage && (
          <Button
            variant="primary"
            onClick={() => open({ type: "create" })}
            disabled={busy || !online}
          >
            <Plus size={16} />
            Person anlegen
          </Button>
        )}
      </PageHeader>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <label htmlFor={`${id}-search`}>Verzeichnis durchsuchen</label>
          <div className={styles.searchField}>
            <Search size={17} />
            <input
              id={`${id}-search`}
              type="search"
              placeholder="Name, Funktion, E-Mail …"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className={styles.filter}>
          <label htmlFor={`${id}-organization`}>Organisation</label>
          <select
            id={`${id}-organization`}
            value={organization}
            onChange={(event) => setOrganization(event.target.value)}
          >
            <option value="">Alle Organisationen</option>
            {organizations.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className={styles.count} role="status">
        <UsersRound size={15} />
        {filtered.length === people.length
          ? `${people.length} ${people.length === 1 ? "Person" : "Personen"}`
          : `${filtered.length} von ${people.length} Personen`}
      </p>
      {!people.length ? (
        <Empty
          title="Kontakte an einem Ort"
          description="Lege eure ersten Ansprechpersonen an. Du kannst sie später direkt einer Produktion zuordnen."
          action={canManage && online ? "Person anlegen" : undefined}
          onAction={() => open({ type: "create" })}
        />
      ) : !filtered.length ? (
        <Empty
          title="Keine passenden Kontakte"
          description="Versuche einen anderen Suchbegriff oder zeige alle Organisationen."
          action="Filter zurücksetzen"
          onAction={() => {
            setQuery("");
            setOrganization("");
          }}
        />
      ) : (
        <div className={styles.list}>
          <div className={styles.listHeader} aria-hidden="true">
            <span>Name & Funktion</span>
            <span>Organisation</span>
            <span>Kontakt</span>
            <span />
          </div>
          <ul aria-label="Kontaktverzeichnis">
            {filtered.map((person) => {
              const name = textValue(person.data.name);
              const initials = name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((word) => Array.from(word)[0])
                .join("")
                .toLocaleUpperCase("de");
              return (
                <li key={person.id} className={styles.row}>
                  <div className={styles.identity}>
                    <span className={styles.avatar} aria-hidden="true">
                      {initials}
                    </span>
                    <div>
                      <RecordLink record={person} className={styles.name}>
                        {name}
                      </RecordLink>
                      <span className={styles.secondary}>
                        {textValue(person.data.position) || "Funktion nicht hinterlegt"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.organization}>
                    {textValue(person.data.organization) || (
                      <span className={styles.secondary}>Organisation nicht hinterlegt</span>
                    )}
                  </div>
                  <PersonContactLinks data={person.data} />
                  <RecordLink
                    record={person}
                    className="icon-button"
                    decoration={false}
                    aria-label={`Kontaktdetails: ${name}`}
                  >
                    <ArrowUpRight size={18} />
                  </RecordLink>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!online && (
        <p className={styles.status} role="status">
          Die zuletzt geladenen Kontakte bleiben durchsuchbar. Zum Anlegen oder Bearbeiten wird eine
          Internetverbindung benötigt.
        </p>
      )}
      {panel?.type === "create" && <PersonEditor onClose={close} />}
      {panel?.type === "export" && <ExportDialog kind="people" onClose={close} />}
    </section>
  );
}
