"use client";

import { ArrowLeft, Users } from "lucide-react";
import { Badge, Button, Section } from "@/components/ui";
import { LinkedText } from "@/components/linked-text";
import {
  contactsValue,
  listValue,
  numberValue,
  textValue,
  type DomainRecord,
  type Workspace,
} from "@/shared/contracts";
import { dateLabel } from "@/shared/client-api";
import { productionContactName } from "@/shared/production-contacts";
import { statusLabels } from "@/components/resource-fields";
import styles from "@/components/workspace-browse.module.css";

export function SharedProductionOverview({
  production,
  workspace,
  onBack,
}: {
  production: DomainRecord;
  workspace: Workspace;
  onBack: () => void;
}) {
  const contacts = contactsValue(production.data.contacts);
  const name = (contact: (typeof contacts)[number]) =>
    productionContactName(contact, workspace.members, workspace.records.people);
  const makeup = [...new Set(contacts.filter((contact) => contact.type === "makeup").map(name))];
  const team = listValue(production.data.memberIds)
    .map((id) => workspace.members.find((member) => member.id === id)?.name)
    .filter(Boolean);

  return (
    <section className={`${styles.productionDetail} ${styles.productionPreview}`}>
      <div className="production-breadcrumb">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Alle Produktionen
        </Button>
        <Badge tone="green">{textValue(production.data.season) || "Spielzeit"}</Badge>
      </div>
      <header className="production-heading">
        <div>
          <p className="eyebrow">{statusLabels[textValue(production.data.status)]}</p>
          <h1>{textValue(production.data.title)}</h1>
        </div>
      </header>
      <section className="production-makeup-contact" aria-label="Maskenbetreuung">
        <Users size={22} aria-hidden="true" />
        <div>
          <span className="eyebrow">MASKENBETREUUNG</span>
          <strong>{makeup.join(", ") || "Noch keine Maskenbetreuung eingetragen"}</strong>
        </div>
      </section>
      <Section title="Über die Produktion">
        <div className="panel-content">
          <p>
            <LinkedText>
              {textValue(production.data.description) || "Noch keine Beschreibung eingetragen."}
            </LinkedText>
          </p>
          <dl className="detail-grid">
            <div>
              <dt>Premiere</dt>
              <dd>{dateLabel(textValue(production.data.premiere))}</dd>
            </div>
            <div>
              <dt>Projektteam</dt>
              <dd>{team.join(", ") || "Noch nicht zugeteilt"}</dd>
            </div>
            {numberValue(production.data.durationMinutes) > 0 && (
              <div>
                <dt>Stückdauer</dt>
                <dd>{numberValue(production.data.durationMinutes)} min</dd>
              </div>
            )}
          </dl>
        </div>
      </Section>
      {contacts.length > 0 && (
        <Section title="Ansprechpersonen">
          <dl className="detail-grid panel-content">
            {contacts.map((contact) => (
              <div key={contact.id}>
                <dt>{contact.role}</dt>
                <dd>{name(contact)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      <p className="small muted">
        Weitere Produktionsbereiche siehst du, sobald du zum Produktionsteam gehörst.
      </p>
    </section>
  );
}
