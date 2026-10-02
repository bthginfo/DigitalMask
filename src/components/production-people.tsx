"use client";
import { useId, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { contactsValue, type DomainRecord, type ProductionContact } from "@/shared/contracts";
import { ids, initials, value } from "@/shared/client-api";
import { PersonPicker } from "@/modules/people/components";
import { productionContactName } from "@/shared/production-contacts";
import { isActiveStaff } from "@/shared/client-members";
import { useWorkspace } from "./workspace-context";
import { Badge, Button, Empty, ErrorMessage, Modal, PageHeader } from "./ui";
import { RecordLink } from "./record-link";

export function ProductionPeopleFields({
  contacts,
  memberIds,
  onChange,
}: {
  contacts: ProductionContact[];
  memberIds: string[];
  onChange: (contacts: ProductionContact[], memberIds: string[]) => void;
}) {
  const { workspace } = useWorkspace();
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
      {!contacts.length && (
        <p className="empty-inline">
          Noch keine Kontakte. Externe Personen benötigen keinen Account.
        </p>
      )}
      {contacts.map((contact, index) => (
        <fieldset className="production-contact-form" key={contact.id}>
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
      <fieldset className="form-multi">
        <legend>Produktionsteam</legend>
        <p className="small muted">
          Weitere aktive Teammitglieder hinzufügen. Zugeordnete Maskenbetreuungen gehören
          automatisch zum Team. Zum Entfernen zuerst den entsprechenden Kontakt entfernen oder auf
          einen freien Namen umstellen.
        </p>
        {teamChoices.map((member) => (
          <label className="check-label" key={member.id}>
            <input
              type="checkbox"
              checked={memberIds.includes(member.id) || contactMembers.includes(member.id)}
              disabled={contactMembers.includes(member.id)}
              onChange={(event) =>
                onChange(
                  contacts,
                  event.target.checked
                    ? [...memberIds, member.id]
                    : memberIds.filter((id) => id !== member.id),
                )
              }
            />
            {member.name}
            {!isActiveStaff(member) && (
              <span className="small muted"> · Historische Zuordnung, entfernen</span>
            )}
            {contactMembers.includes(member.id) && (
              <span className="small muted"> · Maskenbetreuung</span>
            )}
          </label>
        ))}
        {!members.length && <p className="small muted">Noch keine aktiven Teammitglieder.</p>}
      </fieldset>
    </section>
  );
}

export function ProductionTeamModule({ production }: { production: DomainRecord }) {
  const { workspace, save, busy } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [contacts, setContacts] = useState(contactsValue(production.data.contacts));
  const [memberIds, setMemberIds] = useState(ids(production.data, "memberIds"));
  const [error, setError] = useState("");
  const currentContacts = contactsValue(production.data.contacts);
  const team = workspace.members.filter((member) =>
    ids(production.data, "memberIds").includes(member.id),
  );
  const edit = () => {
    setContacts(currentContacts);
    setMemberIds(ids(production.data, "memberIds"));
    setError("");
    setEditing(true);
  };
  return (
    <>
      <PageHeader
        eyebrow="MENSCHEN HINTER DER PRODUKTION"
        title="Team & Kontakte"
        description="Zuständigkeiten und wichtige Personen für dieses Stück."
      >
        <Button onClick={edit}>Team & Kontakte bearbeiten</Button>
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
      <section className="panel production-team-panel">
        <header className="panel-heading">
          <h3>
            <Users size={17} /> Produktionsteam
          </h3>
          <span className="small muted">{team.length} Personen</span>
        </header>
        <div className="production-team-members">
          {team.length ? (
            team.map((member) => (
              <div className="production-team-member" key={member.id}>
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
              </div>
            ))
          ) : (
            <p className="small muted">Noch kein Produktionsteam zugeteilt.</p>
          )}
        </div>
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
                await save("productions", { contacts, memberIds }, production);
                setEditing(false);
              } catch (exception) {
                setError(
                  exception instanceof Error ? exception.message : "Speichern fehlgeschlagen",
                );
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
