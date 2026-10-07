"use client";
import type { DomainRecord } from "@/shared/contracts";
import { LinkedText } from "@/components/linked-text";
import { documentSections, pieceDuration, sectionName } from "@/shared/document-sections";
import { useWorkspace } from "@/components/workspace-context";
export function DocumentContent({ record }: { record: DomainRecord }) {
  const { workspace } = useWorkspace();
  const kind = record.kind === "handovers" ? "handovers" : "looks",
    sections = documentSections(record.data, kind);
  const duration = pieceDuration(record.data, workspace.records.productions);
  return (
    <div className="document-content">
      {record.kind === "looks" && !!duration && (
        <p className="document-duration">
          Stückdauer: <strong>{duration} Minuten</strong>
        </p>
      )}
      {sections.map((section) => (
        <section className="document-read-section" key={section.key}>
          <h3>{sectionName(section.key, kind, workspace.records.categories)}</h3>
          {section.entries.length ? (
            section.entries.map((entry) => (
              <div key={entry.id}>
                {entry.label && <h4>{entry.label}</h4>}
                <p>
                  <LinkedText>{entry.text || "Noch kein Text eingetragen."}</LinkedText>
                </p>
              </div>
            ))
          ) : (
            <p className="small muted">Noch kein Text eingetragen.</p>
          )}
        </section>
      ))}
      {!!(record.data.scene || record.data.durationMinutes || record.data.legacyProductionId) && (
        <details className="document-legacy">
          <summary>Historische Angaben</summary>
          {!!record.data.scene && <p>Frühere Szene / Akt: {String(record.data.scene)}</p>}
          {!!record.data.durationMinutes && (
            <p>Früherer Zeitbedarf: {String(record.data.durationMinutes)} Minuten.</p>
          )}
          {!!record.data.legacyProductionId && (
            <p>
              Frühere Produktion:{" "}
              {String(
                workspace.records.productions.find(
                  (row) => row.id === record.data.legacyProductionId,
                )?.data.title || "Archivierte Produktionszuordnung",
              )}
            </p>
          )}
        </details>
      )}
    </div>
  );
}
