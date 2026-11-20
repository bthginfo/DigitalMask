import React from "react";
import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { productionBackstageChanges } from "../../shared/backstage-changes";
import { textValue } from "../../shared/contracts";
import type { ExportInput } from "./types";

const personTextWidth = (595.28 - 64 - 16) * 0.28 - 12;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Noto",
    fontSize: 10.5,
    lineHeight: 1.3,
    color: "#233932",
    paddingTop: 30,
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 9,
    gap: 12,
  },
  title: { fontSize: 17, fontWeight: 700 },
  production: { flexShrink: 1, textAlign: "right" },
  columns: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: "#eaf1ed",
    fontSize: 9,
    fontWeight: 700,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd6cf",
    paddingTop: 7,
    paddingBottom: 5,
    paddingHorizontal: 8,
  },
  person: { width: "28%", paddingRight: 10 },
  changes: { width: "72%" },
  actor: { fontWeight: 700 },
  figure: { fontSize: 9.5, marginTop: 1 },
  entry: { marginBottom: 3 },
  cue: { fontWeight: 700 },
  empty: { paddingTop: 9 },
});

export function BackstageChangesPage({
  input,
  wrapLines,
}: {
  input: ExportInput;
  wrapLines: (text: string, width: number, size: number, weight: number) => string[];
}) {
  const production = input.references?.productions?.find((row) => row.id === input.productionId);
  const rows = productionBackstageChanges({
    productionId: input.productionId || "",
    looks: input.records,
    actors: input.references?.actors,
    characters: input.references?.characters,
  }).filter((row) => row.entries.length);

  return (
    <Page size="A4" style={styles.page}>
      <View fixed style={styles.heading}>
        <Text style={styles.title}>Umzüge</Text>
        <Text style={styles.production}>
          {wrapLines(textValue(production?.data.title) || "Produktion", 425, 10.5, 400).join("\n")}
        </Text>
      </View>
      <View fixed style={styles.columns}>
        <Text style={styles.person}>Schauspielperson / Figur</Text>
        <Text style={styles.changes}>Umzug hinter der Bühne</Text>
      </View>
      {rows.map(({ record, actor, figure, entries }) => (
        <View key={record.id} style={styles.row}>
          <View style={styles.person}>
            <Text style={styles.actor}>
              {wrapLines(actor, personTextWidth, 10.5, 700).join("\n")}
            </Text>
            {figure && (
              <Text style={styles.figure}>
                {wrapLines(figure, personTextWidth, 9.5, 400).join("\n")}
              </Text>
            )}
          </View>
          <View style={styles.changes}>
            {entries.map((entry) => (
              <Text key={entry.id} style={styles.entry}>
                {entry.label?.trim() && <Text style={styles.cue}>{entry.label.trim()} </Text>}
                {entry.text.trim()}
              </Text>
            ))}
          </View>
        </View>
      ))}
      {!rows.length && (
        <Text style={styles.empty}>Für dieses Stück sind keine Umzüge eingetragen.</Text>
      )}
    </Page>
  );
}
