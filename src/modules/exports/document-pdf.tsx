import React from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { documentPresentation } from "./document-presentation";
import { dateText } from "./data";
import type { DomainRecord } from "../../shared/contracts";
import type { ExportInput } from "./types";

type PrintPage = React.ComponentType<{
  input: ExportInput;
  children: React.ReactNode;
  label?: string;
}>;
type Images = React.ComponentType<{ input: ExportInput; record: DomainRecord }>;
const style = StyleSheet.create({
  meta: {
    backgroundColor: "#eaf1ed",
    padding: 13,
    marginBottom: 21,
    fontSize: 10,
    lineHeight: 1.5,
  },
  minor: { fontSize: 9, color: "#53645e", marginTop: 5 },
  section: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1e5f50",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd6cf",
    paddingBottom: 6,
    marginBottom: 10,
    marginTop: 7,
  },
  entry: { marginBottom: 14 },
  label: { fontSize: 9, fontWeight: 700, color: "#53645e", marginBottom: 5 },
  text: { fontSize: 10, lineHeight: 1.5 },
  checkbox: {
    width: 11,
    height: 11,
    borderWidth: 1,
    borderColor: "#53645e",
    marginRight: 9,
    marginTop: 3,
    fontSize: 8,
    textAlign: "center",
    lineHeight: 1,
  },
});
export function DocumentPages({
  input,
  Page,
  Images,
}: {
  input: ExportInput;
  Page: PrintPage;
  Images: Images;
}) {
  const records = input.records.filter((record) => record.kind === input.kind);
  if (!records.length)
    return (
      <Page input={input}>
        <Text>Keine Dokumente für diese Auswahl.</Text>
      </Page>
    );
  return (
    <>
      {records.map((record) => {
        const document = documentPresentation(record, input),
          look = record.kind === "looks";
        const shortTitle =
          document.title.length > 28 ? `${document.title.slice(0, 27)}…` : document.title;
        return (
          <Page key={record.id} input={input} label={shortTitle}>
            <View style={style.meta}>
              <Text style={{ fontWeight: 700 }}>{document.title}</Text>
              {look ? (
                <>
                  <Text>
                    {document.production} · Figur: {document.character}
                  </Text>
                  <Text>
                    Stückdauer:{" "}
                    {document.productionDurationMinutes
                      ? `${document.productionDurationMinutes} min`
                      : "Nicht angegeben"}
                  </Text>
                </>
              ) : (
                <Text>Allgemeine Übergabe · Erstellt am {dateText(record.createdAt)}</Text>
              )}
              <Text style={style.minor}>Stand: {dateText(record.updatedAt, true)}</Text>
            </View>
            {document.sections.map((section) => (
              <View key={section.key}>
                <Text style={style.section} minPresenceAhead={45}>
                  {section.name}
                </Text>
                {section.entries.length ? (
                  section.entries.map((entry, index) => (
                    <View key={entry.id || `${section.key}-${index}`} style={style.entry}>
                      {(entry.label || section.entries.length > 1) && (
                        <Text style={style.label} minPresenceAhead={30}>
                          {entry.label || `Eintrag ${index + 1}`}
                        </Text>
                      )}
                      <Text style={style.text}>{entry.text || "—"}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ ...style.text, marginBottom: 14, color: "#53645e" }}>—</Text>
                )}
              </View>
            ))}
            {!!document.checklist.length && (
              <View>
                <Text style={style.section} minPresenceAhead={45}>
                  Checkliste
                </Text>
                {document.checklist.map((item, i) => (
                  <View key={i} style={{ flexDirection: "row", marginBottom: 12 }}>
                    <View style={style.checkbox}>
                      <Text>{item.done ? "x" : ""}</Text>
                    </View>
                    <Text style={{ ...style.text, flex: 1 }}>{item.text || "—"}</Text>
                  </View>
                ))}
              </View>
            )}
            {!!document.extraNotes && (
              <View style={style.entry}>
                <Text style={style.section} minPresenceAhead={45}>
                  Weitere Hinweise
                </Text>
                <Text style={style.text}>{document.extraNotes}</Text>
              </View>
            )}
            {!!document.historicalNotes.length && (
              <View style={style.entry}>
                <Text style={style.section} minPresenceAhead={45}>
                  Historische Zusatznotizen
                </Text>
                {document.historicalNotes.map((note, i) => (
                  <Text key={i} style={{ ...style.text, marginBottom: 6 }}>
                    {note}
                  </Text>
                ))}
              </View>
            )}
            <Images input={input} record={record} />
          </Page>
        );
      })}
    </>
  );
}
