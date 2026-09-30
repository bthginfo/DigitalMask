import React from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { dateText, exportRows, readable } from "./data";
import { resolveProductionContacts } from "./contacts";
import type { ExportInput } from "./types";

type PrintPage = React.ComponentType<{
  input: ExportInput;
  children: React.ReactNode;
  label?: string;
}>;
const style = StyleSheet.create({
  meta: {
    backgroundColor: "#eaf1ed",
    padding: 13,
    marginBottom: 20,
    fontSize: 10,
    lineHeight: 1.5,
  },
  heading: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1e5f50",
    paddingBottom: 6,
    marginTop: 8,
    marginBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd6cf",
  },
  text: { fontSize: 10, lineHeight: 1.5 },
  contact: { marginBottom: 20 },
  name: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
});
export function ProductionPages({ input, Page }: { input: ExportInput; Page: PrintPage }) {
  const rows = exportRows(input);
  if (!rows.length)
    return (
      <Page input={input}>
        <Text>Keine Produktionen für diese Auswahl.</Text>
      </Page>
    );
  return (
    <>
      {rows.map((row) => {
        const title = readable(row.values.title),
          contacts = resolveProductionContacts(row.record, input.members, input.references?.people);
        return (
          <Page
            key={row.id}
            input={input}
            label={title.length > 28 ? `${title.slice(0, 27)}…` : title || "Produktion"}
          >
            <View style={style.meta}>
              <Text style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                {title || "Produktion"}
              </Text>
              <Text>
                Spielzeit: {readable(row.values.season) || "Nicht angegeben"} · Status:{" "}
                {readable(row.values.status) || "Nicht angegeben"}
              </Text>
              <Text>
                Premiere: {dateText(row.values.premiere) || "Nicht angegeben"} · Stückdauer:{" "}
                {row.values.productionDurationMinutes
                  ? `${row.values.productionDurationMinutes} min`
                  : "Nicht angegeben"}
              </Text>
              <Text>Team: {readable(row.values.person) || "Nicht zugeordnet"}</Text>
            </View>
            {!!readable(row.values.description) && (
              <View>
                <Text style={style.heading} minPresenceAhead={45}>
                  Produktionsnotizen
                </Text>
                <Text style={{ ...style.text, marginBottom: 20 }}>
                  {readable(row.values.description)}
                </Text>
              </View>
            )}
            <Text style={style.heading} minPresenceAhead={55}>
              Zuständigkeiten und Kontakte
            </Text>
            {!contacts.length && <Text style={style.text}>Keine Kontakte hinterlegt.</Text>}
            {contacts.map((contact) => (
              <View key={contact.id} style={style.contact}>
                <Text
                  style={{ ...style.text, color: "#1e5f50", fontWeight: 700, marginBottom: 7 }}
                  minPresenceAhead={40}
                >
                  {contact.role || "Kontakt"}
                </Text>
                <Text style={style.name} minPresenceAhead={25}>
                  {contact.name}
                </Text>
                <Text style={{ ...style.text, color: "#53645e", marginBottom: 5 }}>
                  {contact.type === "makeup" ? "Maskenteam" : "Externer Kontakt"}
                  {contact.organization ? ` · ${contact.organization}` : ""}
                  {contact.position ? ` · ${contact.position}` : ""}
                </Text>
                {!!contact.email && <Text style={style.text}>E-Mail: {contact.email}</Text>}
                {!!contact.phone && <Text style={style.text}>Telefon: {contact.phone}</Text>}
                {!!contact.notes && (
                  <Text style={{ ...style.text, marginTop: 5 }}>{contact.notes}</Text>
                )}
              </View>
            ))}
          </Page>
        );
      })}
    </>
  );
}
