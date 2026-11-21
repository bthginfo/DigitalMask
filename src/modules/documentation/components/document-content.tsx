"use client";
import { useId } from "react";
import type { DomainRecord } from "@/shared/contracts";
import { LinkedText } from "@/components/linked-text";
import { documentSections, sectionName } from "@/shared/document-sections";
import { useWorkspace } from "@/components/workspace-context";
import styles from "./document-sections.module.css";
export function DocumentContent({ record }: { record: DomainRecord }) {
  const { workspace } = useWorkspace();
  const sectionId = useId();
  const kind = record.kind === "handovers" ? "handovers" : "looks";
  const compact = record.kind === "looks";
  const allSections = documentSections(record.data, kind);
  const sections = compact
    ? allSections
        .map((section) => ({
          ...section,
          entries: section.entries.filter((entry) => entry.label?.trim() || entry.text.trim()),
        }))
        .filter((section) => section.entries.length)
    : allSections;
  return (
    <div
      className={`document-content ${kind === "looks" ? styles.content : ""} ${compact ? styles.compactContent : ""}`}
    >
      {compact && !sections.length && <p className="small muted">Noch kein Text im Aufschrieb.</p>}
      {compact && sections.length >= 3 && (
        <select
          className={styles.sectionJump}
          aria-label="Zum Abschnitt springen"
          value=""
          onChange={(event) => {
            const heading = document.getElementById(event.target.value);
            if (!heading) return;
            const header = heading.closest("dialog")?.querySelector(".dialog-heading");
            heading.style.scrollMarginTop = `${(header?.getBoundingClientRect().height || 0) + 12}px`;
            heading.focus({ preventScroll: true });
            heading.scrollIntoView({ block: "start", behavior: "instant" });
          }}
        >
          <option value="" disabled>
            Zum Abschnitt springen …
          </option>
          {sections.map((section, index) => (
            <option key={section.key} value={`${sectionId}-${index}`}>
              {sectionName(section.key, kind, workspace.records.categories)}
            </option>
          ))}
        </select>
      )}
      {sections.map((section, index) => {
        const name = sectionName(section.key, kind, workspace.records.categories);
        return (
          <section
            className={`document-read-section ${kind === "looks" ? styles.sectionCard : ""}`}
            aria-label={name}
            key={section.key}
          >
            <h3 id={`${sectionId}-${index}`} tabIndex={-1}>
              {name}
            </h3>
            {compact ? (
              <div className={styles.entries}>
                {section.entries.map((entry) => (
                  <p key={entry.id}>
                    {entry.label?.trim() && (
                      <>
                        <strong>{entry.label.trim()}</strong>
                        {entry.text.trim() && " "}
                      </>
                    )}
                    <LinkedText>{entry.text}</LinkedText>
                  </p>
                ))}
              </div>
            ) : section.entries.length ? (
              section.entries.map((entry) => (
                <div key={entry.id}>
                  {entry.label && (
                    <h4 className={kind === "looks" ? styles.entryLabel : undefined}>
                      {entry.label}
                    </h4>
                  )}
                  <p>
                    <LinkedText>{entry.text || "Noch kein Text eingetragen."}</LinkedText>
                  </p>
                </div>
              ))
            ) : (
              <p className="small muted">Noch kein Text eingetragen.</p>
            )}
          </section>
        );
      })}
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
