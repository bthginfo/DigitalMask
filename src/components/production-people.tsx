"use client";
import { useId, useRef, useState } from "react";
import { Check, LoaderCircle, Plus, Trash2, Users } from "lucide-react";
import {
  contactsValue,
  type DomainRecord,
  type Member,
  type ProductionContact,
} from "@/shared/contracts";
import { ApiFailure, ids, initials, value } from "@/shared/client-api";
import { PersonPicker } from "@/modules/people/components";
import {
  hasMakeupResponsibility,
  productionContactName,
  toggleMakeupResponsibility,
} from "@/shared/production-contacts";
import { isActiveStaff } from "@/shared/client-members";
import { useWorkspace } from "./workspace-context";
import { Badge, Button, Empty, ErrorMessage, Modal, PageHeader } from "./ui";
import { RecordLink } from "./record-link";
import styles from "./production-makeup-choice.module.css";

function MakeupChoice({
  member,
  selected,
  disabled,
  pending = false,
  onClick,
}: {
  member: Member;
  selected: boolean;
  disabled: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.choice}
      aria-label={`Maskenbetreuung für ${member.name}`}
      aria-pressed={selected}
      disabled={disabled}
      title={
        selected
          ? "Betreuung entfernen. Die Person bleibt im Produktionsteam."
          : "Als Maskenbetreuung auswählen"
      }
      onClick={onClick}
    >
      {pending ? (
        <LoaderCircle size={16} className={styles.spinner} aria-hidden="true" />
      ) : selected ? (
        <Check size={16} aria-hidden="true" />
      ) : (
        <Plus size={16} aria-hidden="true" />
      )}
      {selected ? "Maskenbetreuung" : "Als Maskenbetreuung"}
    </button>
  );
}

const productionChangedMessage =
  "Die Produktion wurde inzwischen geändert. Deine Zuordnung wurde nicht gespeichert. Lade den aktuellen Stand und versuche es erneut.";

function saveError(exception: unknown) {
  return exception instanceof ApiFailure && exception.status === 409
    ? productionChangedMessage
    : exception instanceof Error
      ? exception.message
      : "Speichern fehlgeschlagen. Bitte versuche es erneut.";
}

export function ProductionPeopleFields({
  contacts,
  memberIds,
  onChange,
}: {
  contacts: ProductionContact[];
  memberIds: string[];
  onChange: (contacts: ProductionContact[], memberIds: string[]) => void;
}) {
  const { workspace, busy } = useWorkspace();
  const roleList = useId();
  const roles = [
    ...new Set([
      "Regie",
      "Kostüm",
      "Assistenz",
      "Maskenbetreuung",
      ...workspace.records.productions.flatMap((row) =>
        contactsValue(row.data.contacts).map((contact) => contact.role),
      ),
    ]),
  ].filter(Boolean);
  const members = workspace.members.filter(isActiveStaff);
  const update = (id: string, data: Partial<ProductionContact>) =>
    onChange(
      contacts.map((contact) => (contact.id === id ? { ...contact, ...data } : contact)),
      memberIds,
    );
  const contactMembers = contacts.map((contact) => contact.memberId).filter(Boolean);
  const teamChoices = workspace.members.filter(
    (member) =>
      isActiveStaff(member) || memberIds.includes(member.id) || contactMembers.includes(member.id),
  );
  return (
    <section className="production-people-fields field-wide">
      <header className="panel-heading">
        <div>
          <h3>Kontakte & Zuständigkeiten</h3>
          <p className="small muted">
            Freie Rollen für Regie, Kostüm, Assistenz und Maskenbetreuung.
          </p>
        </div>
        <Button
          disabled={busy}
          onClick={() =>
            onChange(
              [
                ...contacts,
                { id: crypto.randomUUID(), role: "", type: "external", name: "", memberId: "" },
              ],
              memberIds,
            )
          }
        >
          <Plus size={16} />
          Kontakt hinzufügen
        </Button>
      </header>
      <datalist id={roleList}>
        {roles.map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>
      <fieldset className={`form-multi ${styles.formTeam}`} disabled={busy}>
        <legend>Produktionsteam</legend>
        <p className="small muted">
          Teammitglieder auswählen und bei Bedarf direkt als Maskenbetreuung zuweisen. Wenn du die
          Betreuung entfernst, bleibt die Person im Team.
        </p>
        {teamChoices.map((member) => {
          const included = memberIds.includes(member.id) || contactMembers.includes(member.id);
          return (
            <div className={styles.formMember} key={member.id}>
              <label className={`check-label ${styles.memberCheck}`}>
                <input
                  type="checkbox"
                  checked={included}
                  disabled={contactMembers.includes(member.id)}
                  onChange={(event) =>
                    onChange(
                      contacts,
                      event.target.checked
                        ? [...new Set([...memberIds, member.id])]
                        : memberIds.filter((id) => id !== member.id),
                    )
                  }
                />
                <span>
                  {member.name}
                  {!isActiveStaff(member) && (
                    <span className="small muted"> · Historische Zuordnung, entfernen</span>
                  )}
                </span>
              </label>
              {included && isActiveStaff(member) && (
                <MakeupChoice
                  member={member}
                  selected={hasMakeupResponsibility(contacts, member.id)}
                  disabled={busy}
                  onClick={() => {
                    const next = toggleMakeupResponsibility(
                      contacts,
                      memberIds,
                      member.id,
                      crypto.randomUUID(),
                    );
                    onChange(next.contacts, next.memberIds);
                  }}
                />
              )}
            </div>
          );
        })}
        {!members.length && <p className="small muted">Noch keine aktiven Teammitglieder.</p>}
      </fieldset>
      {!contacts.length && (
        <p className="empty-inline">
          Noch keine Kontakte. Externe Personen benötigen keinen Account.
        </p>
      )}
      {contacts.map((contact, index) => (
        <fieldset className="production-contact-form" key={contact.id} disabled={busy}>
          <legend>Kontakt {index + 1}</legend>
          <div className="form-grid">
            <label>
              Rolle
              <input
                required
                list={roleList}
                value={contact.role}
                placeholder="z. B. Regieassistenz"
                onChange={(event) => update(contact.id, { role: event.target.value })}
              />
            </label>
            <label>
              Zuordnung
              <select
                value={contact.type}
                onChange={(event) =>
                  update(contact.id, {
                    type: event.target.value as ProductionContact["type"],
                    memberId: "",
                    name: "",
                    personId: "",
                  })
                }
              >
                <option value="external">Externe Person</option>
                <option value="makeup">Maskenbetreuung</option>
              </select>
            </label>
            {contact.type === "makeup" && (
              <label>
                Person auswählen
                <select
                  aria-label={`Person für Kontakt ${index + 1}`}
                  value={contact.memberId || ""}
                  onChange={(event) =>
                    update(contact.id, { memberId: event.target.value, name: "", personId: "" })
                  }
                >
                  <option value="">Namen frei eintragen</option>
                  {contact.memberId &&
                    !members.some((member) => member.id === contact.memberId) && (
                      <option disabled value={contact.memberId}>
                        {workspace.members.find((member) => member.id === contact.memberId)?.name ||
                          "Bisheriges Teammitglied"}{" "}
                        · historische Zuordnung, bitte neu zuordnen
                      </option>
                    )}
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!contact.memberId && (
              <div className="field-wide">
                <PersonPicker
                  value={contact.personId || ""}
                  label={`Verzeichnis für Kontakt ${index + 1}`}
                  onChange={(personId) =>
                    update(contact.id, {
                      personId,
                      name: value(
                        workspace.records.people.find((person) => person.id === personId)?.data ||
                          {},
                        "name",
                      ),
                    })
                  }
                  onCreated={(person) =>
                    update(contact.id, { personId: person.id, name: value(person.data, "name") })
                  }
                />
              </div>
            )}
            {!contact.memberId && !contact.personId && (
              <label>
                Name
                <input
                  required
                  value={contact.name}
                  onChange={(event) =>
                    update(contact.id, { name: event.target.value, personId: "" })
                  }
                  placeholder="Vor- und Nachname"
                />
              </label>
            )}
          </div>
          <Button
            variant="danger-ghost"
            onClick={() =>
              onChange(
                contacts.filter((row) => row.id !== contact.id),
                memberIds,
              )
            }
          >
            <Trash2 size={15} />
            Kontakt {index + 1} entfernen
          </Button>
        </fieldset>
      ))}
    </section>
  );
}

export function ProductionTeamModule({ production }: { production: DomainRecord }) {
  const { workspace, save, refresh, busy } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [editingBase, setEditingBase] = useState<DomainRecord | null>(null);
  const [contacts, setContacts] = useState(contactsValue(production.data.contacts));
  const [memberIds, setMemberIds] = useState(ids(production.data, "memberIds"));
  const [error, setError] = useState("");
  const [quickError, setQuickError] = useState("");
  const [quickNotice, setQuickNotice] = useState("");
  const [pendingMemberId, setPendingMemberId] = useState("");
  const quickMutation = useRef(false);
  const currentContacts = contactsValue(production.data.contacts);
  const team = workspace.members.filter((member) =>
    ids(production.data, "memberIds").includes(member.id),
  );
  const edit = () => {
    setContacts(currentContacts);
    setMemberIds(ids(production.data, "memberIds"));
    setError("");
    setEditingBase(production);
    setEditing(true);
  };
  const toggleSaved = async (member: Member) => {
    if (quickMutation.current || busy || !isActiveStaff(member)) return;
    quickMutation.current = true;
    setPendingMemberId(member.id);
    setQuickError("");
    setQuickNotice("");
    const original = production;
    const originalContacts = contactsValue(original.data.contacts);
    const selected = hasMakeupResponsibility(originalContacts, member.id);
    const next = toggleMakeupResponsibility(
      originalContacts,
      ids(original.data, "memberIds"),
      member.id,
      crypto.randomUUID(),
    );
    try {
      await save("productions", next, original);
      setQuickNotice(
        selected
          ? `${member.name} bleibt im Team, ohne Maskenbetreuung.`
          : `${member.name} ist jetzt Maskenbetreuung.`,
      );
    } catch (exception) {
      setQuickError(saveError(exception));
    } finally {
      quickMutation.current = false;
      setPendingMemberId("");
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="MENSCHEN HINTER DER PRODUKTION"
        title="Team & Kontakte"
        description="Zuständigkeiten und wichtige Personen für dieses Stück."
      >
        <Button onClick={edit} disabled={busy || !!pendingMemberId}>
          Team & Kontakte bearbeiten
        </Button>
      </PageHeader>
      {currentContacts.length ? (
        <div className="production-contacts-list">
          {currentContacts.map((contact) => (
            <article className="production-contact" key={contact.id}>
              <span className="contact-role">{contact.role}</span>
              <strong>
                {contact.personId &&
                workspace.records.people.some(
                  (person) =>
                    person.id === contact.personId && !value(person.data, "linkedMemberId"),
                ) ? (
                  <RecordLink
                    record={workspace.records.people.find(
                      (person) => person.id === contact.personId,
                    )!}
                  >
                    {productionContactName(contact, workspace.members, workspace.records.people)}
                  </RecordLink>
                ) : (
                  productionContactName(contact, workspace.members, workspace.records.people)
                )}
              </strong>
              <Badge tone={contact.type === "makeup" ? "green" : "neutral"}>
                {contact.type === "makeup" ? "Maskenbetreuung" : "Extern"}
              </Badge>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Wer wirkt an diesem Stück mit?"
          description="Ergänzt eure Kontakte mit frei gewählten Rollen, auch ohne Theateraccount."
          action="Kontakte hinzufügen"
          onAction={edit}
        />
      )}
      <section className="panel production-team-panel" aria-label="Produktionsteam">
        <header className="panel-heading">
          <h3>
            <Users size={17} /> Produktionsteam
          </h3>
          <span className="small muted">{team.length} Personen</span>
        </header>
        <div className="production-team-members">
          {team.length ? (
            team.map((member) => (
              <div className={`production-team-member ${styles.savedMember}`} key={member.id}>
                <span className="avatar">{initials(member.name)}</span>
                <div>
                  <strong>{member.name}</strong>
                  <span className="small muted">
                    {currentContacts
                      .filter((contact) => contact.memberId === member.id)
                      .map((contact) => contact.role)
                      .join(" · ") || "Teammitglied"}
                    {member.status !== "active" ? " · Nicht aktiv" : ""}
                  </span>
                </div>
                {isActiveStaff(member) && (
                  <MakeupChoice
                    member={member}
                    selected={hasMakeupResponsibility(currentContacts, member.id)}
                    disabled={busy || !!pendingMemberId}
                    pending={pendingMemberId === member.id}
                    onClick={() => void toggleSaved(member)}
                  />
                )}
              </div>
            ))
          ) : (
            <p className="small muted">Noch kein Produktionsteam zugeteilt.</p>
          )}
        </div>
        {(quickNotice || quickError) && (
          <div className={styles.feedback}>
            {quickNotice && (
              <p className={styles.success} role="status">
                <Check size={16} aria-hidden="true" /> {quickNotice}
              </p>
            )}
            <ErrorMessage message={quickError} />
            {quickError === productionChangedMessage && (
              <Button
                disabled={busy || !!pendingMemberId}
                onClick={async () => {
                  setQuickError("");
                  try {
                    await refresh();
                  } catch (exception) {
                    setQuickError(saveError(exception));
                  }
                }}
              >
                Aktuellen Stand laden
              </Button>
            )}
          </div>
        )}
      </section>
      {editing && (
        <Modal
          title={`Team & Kontakte · ${value(production.data, "title")}`}
          onClose={() => setEditing(false)}
          wide
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              try {
                await save("productions", { contacts, memberIds }, editingBase || production);
                setQuickError("");
                setQuickNotice("");
                setEditing(false);
              } catch (exception) {
                setError(saveError(exception));
              }
            }}
          >
            <ProductionPeopleFields
              contacts={contacts}
              memberIds={memberIds}
              onChange={(nextContacts, nextMembers) => {
                setContacts(nextContacts);
                setMemberIds(nextMembers);
              }}
            />
            <ErrorMessage message={error} />
            <footer className="dialog-footer">
              <Button onClick={() => setEditing(false)}>Abbrechen</Button>
              <Button type="submit" variant="primary" disabled={busy}>
                Speichern
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
