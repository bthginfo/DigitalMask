import React from "react";
import { Image as PdfImage, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { listValue, textValue, type DomainRecord } from "../../shared/contracts";
import { productionLookDuration } from "../../shared/document-sections";
import { personNameKey } from "../../shared/person-identity";
import { documentPresentation } from "./document-presentation";
import type { ExportInput } from "./types";

const photosPerPage = 8;
const contentWidth = 595.28 - 64;
const style = StyleSheet.create({
  page: {
    fontFamily: "Noto",
    fontSize: 10.5,
    lineHeight: 1.28,
    color: "#233932",
    paddingHorizontal: 32,
    paddingTop: 46,
    paddingBottom: 48,
  },
  masthead: {
    position: "absolute",
    top: 22,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd6cf",
    paddingBottom: 6,
    color: "#53645e",
    fontSize: 8,
  },
  brand: { width: "39%", fontWeight: 700, color: "#1e5f50", maxLines: 1 },
  mastheadName: { width: "60%", textAlign: "right", maxLines: 1, textOverflow: "ellipsis" },
  heading: { marginBottom: 8 },
  name: { fontSize: 19, fontWeight: 700, lineHeight: 1.2, marginBottom: 3 },
  meta: { fontSize: 9.5, color: "#53645e" },
  note: { marginBottom: 8 },
  figure: { fontSize: 11, fontWeight: 700, marginBottom: 3 },
  section: {
    fontSize: 10.5,
    fontWeight: 700,
    color: "#1e5f50",
    marginTop: 5,
    marginBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd6cf",
    paddingBottom: 2,
  },
  entry: { marginBottom: 3 },
  label: { fontWeight: 700 },
  photoSheet: { height: "100%" },
  photoGrid: { flex: 1, gap: 10, minHeight: 0 },
  photoRow: { flex: 1, flexDirection: "row", gap: 10, minHeight: 0 },
  photoCell: { flex: 1, minWidth: 0, minHeight: 0 },
  photoFrame: { flex: 1, position: "relative", backgroundColor: "#f4f7f5", minHeight: 0 },
  photo: { position: "absolute", width: "100%", height: "100%", objectFit: "contain" },
  caption: { fontSize: 8.5, color: "#53645e", marginTop: 3, maxLines: 1, textOverflow: "ellipsis" },
  missing: { padding: 12, fontSize: 9, color: "#53645e" },
});

type LookDocument = ReturnType<typeof documentPresentation>;
type LookPhoto = { id: string; figure: string };

function groupLooks(records: DomainRecord[]) {
  const productions = new Map<string, Map<string, DomainRecord[]>>();
  for (const record of records) {
    const productionId = textValue(record.data.productionId);
    const productionKey = productionId
      ? `id:${productionId}`
      : `name:${textValue(record.data.productionName)}`;
    const actorId = textValue(record.data.actorId);
    const actorName = personNameKey(record.data.actorName);
    const actorKey = actorId
      ? `id:${actorId}`
      : actorName
        ? `name:${actorName}`
        : `note:${record.id}`;
    const actors = productions.get(productionKey) ?? new Map<string, DomainRecord[]>();
    productions.set(productionKey, actors);
    const notes = actors.get(actorKey) ?? [];
    notes.push(record);
    actors.set(actorKey, notes);
  }
  return [...productions.values()].map((actors) => [...actors.values()]);
}

function LookMasthead({ department, name }: { department: string; name?: string }) {
  return (
    <View style={style.masthead} fixed>
      <Text style={style.brand}>DIGITALMASK / {department.toUpperCase()}</Text>
      {name && (
        <Text
          style={style.mastheadName}
          render={({ subPageNumber }) => (subPageNumber > 1 ? name : "")}
        />
      )}
    </View>
  );
}

function LookText({ document }: { document: LookDocument }) {
  return (
    <View style={style.note}>
      {document.character !== "Nicht angegeben" && (
        <Text style={style.figure} minPresenceAhead={30}>
          {document.character}
        </Text>
      )}
      {document.sections.map((section) => {
        const entries = section.entries.filter((entry) => entry.label?.trim() || entry.text.trim());
        return entries.length ? (
          <View key={section.key}>
            <Text style={style.section} minPresenceAhead={18}>
              {section.name}
            </Text>
            {entries.map((entry) => (
              <Text key={entry.id} style={style.entry}>
                {entry.label && <Text style={style.label}>{entry.label} </Text>}
                {entry.text}
              </Text>
            ))}
          </View>
        ) : null;
      })}
      {!!document.checklist.length && (
        <View>
          <Text style={style.section} minPresenceAhead={18}>
            Checkliste
          </Text>
          {document.checklist.map((item, index) => (
            <Text key={index} style={style.entry}>
              {item.done ? "[x]" : "[ ]"} {item.text}
            </Text>
          ))}
        </View>
      )}
      {document.extraNotes && (
        <View>
          <Text style={style.section} minPresenceAhead={18}>
            Weitere Hinweise
          </Text>
          <Text style={style.entry}>{document.extraNotes}</Text>
        </View>
      )}
      {!!document.historicalNotes.length && (
        <View>
          <Text style={style.section} minPresenceAhead={18}>
            Historische Zusatznotizen
          </Text>
          {document.historicalNotes.map((note, index) => (
            <Text key={index} style={style.entry}>
              {note}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function LookPhotoGrid({
  input,
  photos,
  offset,
  showFigure,
}: {
  input: ExportInput;
  photos: LookPhoto[];
  offset: number;
  showFigure: boolean;
}) {
  return (
    <View style={style.photoGrid}>
      {Array.from({ length: Math.ceil(photos.length / 2) }, (_, row) => (
        <View key={row} style={style.photoRow}>
          {photos.slice(row * 2, row * 2 + 2).map((photo, column) => {
            const number = offset + row * 2 + column + 1;
            const bytes = input.images?.[photo.id];
            return (
              <View key={number} style={style.photoCell}>
                <View style={style.photoFrame}>
                  {bytes ? (
                    <PdfImage
                      style={style.photo}
                      src={{ data: Buffer.from(bytes), format: "jpg" }}
                    />
                  ) : (
                    <Text style={style.missing}>
                      Bild nicht verfügbar. Bitte die Galerie prüfen.
                    </Text>
                  )}
                </View>
                <Text style={style.caption}>
                  Bild {number}
                  {showFigure && photo.figure !== "Nicht angegeben" ? ` · ${photo.figure}` : ""}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function LookPages({
  input,
  wrapLines,
}: {
  input: ExportInput;
  wrapLines: (text: string, width: number, size: number, weight: number) => string[];
}) {
  const groups = groupLooks(input.records.filter((record) => record.kind === "looks"));
  if (!groups.length)
    return (
      <Page size="A4" style={style.page}>
        <LookMasthead department={input.department} />
        <Text>Keine Aufschriebe für diese Auswahl.</Text>
      </Page>
    );

  return (
    <>
      {groups.flatMap((actors) => {
        const productionId = actors[0][0].data.productionId;
        const production = input.references?.productions?.find((row) => row.id === productionId);
        const season = textValue(production?.data.season) || input.season;
        const duration = production
          ? productionLookDuration(production, input.references?.looks ?? input.records)
          : 0;
        return actors.map((records, actorIndex) => {
          const documents = records.map((record) => documentPresentation(record, input));
          const { title, production: productionName } = documents[0];
          const name = wrapLines(title, contentWidth, style.name.fontSize, 700).join("\n");
          const context =
            productionName !== "Nicht angegeben"
              ? productionName
              : productionId
                ? "Frühere Produktion"
                : "Allgemeine Aufschriebe";
          const photos = records.flatMap((record, index) =>
            listValue(record.data.imageIds).map((id) => ({
              id,
              figure: documents[index].character,
            })),
          );
          return (
            <React.Fragment key={records[0].id}>
              <Page size="A4" style={style.page}>
                <LookMasthead department={input.department} name={title} />
                <View style={style.heading}>
                  <Text style={style.name}>{name}</Text>
                  <Text style={style.meta}>
                    {context}
                    {actorIndex === 0 && season ? ` · Spielzeit ${season}` : ""}
                    {actorIndex === 0 && duration > 0 ? ` · Stückdauer ${duration} min` : ""}
                  </Text>
                </View>
                {documents.map((document, index) => (
                  <LookText key={records[index].id} document={document} />
                ))}
              </Page>
              {Array.from({ length: Math.ceil(photos.length / photosPerPage) }, (_, page) => {
                const offset = page * photosPerPage;
                return (
                  <Page key={page} size="A4" style={style.page} wrap={false}>
                    <LookMasthead department={input.department} />
                    <View style={style.photoSheet}>
                      <View style={style.heading}>
                        <Text style={style.name}>{name}</Text>
                        <Text style={style.meta}>Bilder · {context}</Text>
                      </View>
                      <LookPhotoGrid
                        input={input}
                        photos={photos.slice(offset, offset + photosPerPage)}
                        offset={offset}
                        showFigure={documents.length > 1}
                      />
                    </View>
                  </Page>
                );
              })}
            </React.Fragment>
          );
        });
      })}
    </>
  );
}
