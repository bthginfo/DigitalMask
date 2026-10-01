"use client";
import { useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Building2, Pencil, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { Button, Empty, ErrorMessage, ExportButton, Modal, PageHeader } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";
import { useWorkspace } from "@/components/workspace-context";
import { textValue, type DomainRecord } from "@/shared/contracts";
import { canManageRecord } from "@/shared/record-permissions";
import { PersonEditor } from "./person-editor";
import { PersonContactLinks } from "./person-contact-links";
import { filterPeople, isDirectoryPerson } from "./person-data";
import styles from "./people.module.css";

type Panel =
  | { type: "create" }
  | { type: "export" }
  | { type: "details" | "edit" | "delete"; person: DomainRecord }
  | null;
export function PeopleModule() {
  const { workspace, busy, online, remove, notify } = useWorkspace();
  const [query, setQuery] = useState(""),
    [organization, setOrganization] = useState("");
  const [panel, setPanel] = useState<Panel>(null),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const pending = useRef(false),
    id = useId(),
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
    setError("");
    setPanel(next);
  };
  const close = () => {
    if (!pending.current) open(null);
  };
  const deletePerson = async (person: DomainRecord) => {
    if (pending.current || busy || !online || !canManage) return;
    pending.current = true;
    setDeleting(true);
    setError("");
    try {
      await remove(person);
      notify("Kontakt gelöscht.");
      setPanel(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Der Kontakt konnte nicht gelöscht werden.",
      );
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  };
  return (
    <section className={styles.directory}>
      <PageHeader
        eyebrow="Kontakte"
        title="Weitere Personen"
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
                      <button
                        type="button"
                        className={styles.name}
                        onClick={() => open({ type: "details", person })}
                      >
                        {name}
                      </button>
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
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Kontaktdetails: ${name}`}
                    onClick={() => open({ type: "details", person })}
                  >
                    <ArrowUpRight size={18} />
                  </button>
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
      {panel?.type === "edit" && <PersonEditor record={panel.person} onClose={close} />}
      {panel?.type === "export" && <ExportDialog kind="people" onClose={close} />}
      {panel?.type === "details" && (
        <Modal title="Kontaktdetails" onClose={close}>
          <article className={styles.detail}>
            <h3 className={styles.detailTitle}>{textValue(panel.person.data.name)}</h3>
            {textValue(panel.person.data.position) && (
              <p className="muted">{textValue(panel.person.data.position)}</p>
            )}
            <dl className={styles.details}>
              <div>
                <dt>
                  <Building2 size={13} /> Organisation
                </dt>
                <dd>{textValue(panel.person.data.organization) || "Nicht hinterlegt"}</dd>
              </div>
              {textValue(panel.person.data.notes) && (
                <div>
                  <dt>Notizen</dt>
                  <dd>{textValue(panel.person.data.notes)}</dd>
                </div>
              )}
            </dl>
            <PersonContactLinks data={panel.person.data} />
            <div className={styles.actions}>
              {canManage && (
                <>
                  <Button
                    onClick={() => open({ type: "edit", person: panel.person })}
                    disabled={busy || !online}
                  >
                    <Pencil size={15} />
                    Bearbeiten
                  </Button>
                  <Button
                    variant="danger-ghost"
                    onClick={() => open({ type: "delete", person: panel.person })}
                    disabled={busy || !online}
                  >
                    <Trash2 size={15} />
                    Löschen
                  </Button>
                </>
              )}
              <Button onClick={close}>Schließen</Button>
            </div>
          </article>
        </Modal>
      )}
      {panel?.type === "delete" && (
        <Modal title="Kontakt löschen?" onClose={close}>
          <div className={styles.detail}>
            <p className={styles.intro}>
              <strong>{textValue(panel.person.data.name)}</strong> wird aus dem Verzeichnis
              entfernt. Kontakte, die einer Produktion zugeordnet sind, bleiben geschützt.
            </p>
            <ErrorMessage message={error} />
            <div className={styles.actions}>
              <Button onClick={close} disabled={deleting}>
                Abbrechen
              </Button>
              <Button
                variant="danger-ghost"
                onClick={() => void deletePerson(panel.person)}
                disabled={busy || deleting || !online}
              >
                {deleting ? "Wird gelöscht …" : "Kontakt löschen"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
