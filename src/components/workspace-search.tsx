"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { isDirectoryPerson } from "@/modules/people/components/person-data";
import { value } from "@/shared/client-api";
import { recordHref } from "@/shared/client-navigation";
import { castingCharacter, relatedProduction } from "@/shared/record-relationships";
import { labels, recordTitle } from "./resource-fields";
import { matchesSearch, searchTerms, searchText } from "@/shared/search-text";
import { Empty, Modal } from "./ui";
import { useWorkspace } from "./workspace-context";

const excluded = new Set([
  "files",
  "notifications",
  "timesheets",
  "messages",
  "time",
  "feedback",
  "attendance",
  "calendarCategories",
  "conversations",
]);

export function WorkspaceSearch({
  onClose,
  navigate,
}: {
  onClose: () => void;
  navigate: (url: string) => void;
}) {
  const { workspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const deferredTerm = useDeferredValue(search);
  const searching = deferredTerm.trim().length >= 2;
  const index = useMemo(() => {
    if (!searching) return [];
    return Object.values(workspace.records)
      .flat()
      .filter(
        (record) =>
          !excluded.has(record.kind) && (record.kind !== "people" || isDirectoryPerson(record)),
      )
      .map((record) => {
        const title = recordTitle(record, workspace);
        const description =
          record.kind === "looks" || record.kind === "casting"
            ? [
                value(relatedProduction(record, workspace)?.data || {}, "title"),
                record.kind === "looks" &&
                  (value(castingCharacter(record, workspace)?.data || {}, "name") ||
                    value(record.data, "characterName")),
              ]
                .filter(Boolean)
                .join(" · ")
            : value(record.data, "description") || value(record.data, "notes");
        return {
          record,
          title,
          name: title.toLocaleLowerCase("de"),
          description,
          content: searchText(record.kind, record, workspace),
        };
      });
  }, [workspace, searching]);
  const terms = searchTerms(deferredTerm);
  const byName = index.filter((item) => matchesSearch(item.name, terms));
  const results = byName
    .concat(
      byName.length >= 30
        ? []
        : index.filter(
            (item) => !matchesSearch(item.name, terms) && matchesSearch(item.content, terms),
          ),
    )
    .slice(0, 30);
  return (
    <Modal title="Im Arbeitsraum suchen" onClose={onClose} wide>
      <div className="global-search-field">
        <Search size={20} aria-hidden="true" />
        <input
          autoFocus
          type="search"
          enterKeyHint="search"
          placeholder="Person, Stück oder Suchbegriff …"
          aria-label="Suchbegriff"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {!searching ? (
        <p className="empty-inline">Mindestens 2 Zeichen eingeben.</p>
      ) : results.length ? (
        <div className="search-results">
          {results.map(({ record, title, description }) => (
            <button
              key={record.id}
              onClick={() => {
                navigate(recordHref(record));
                onClose();
              }}
            >
              <span className="small muted">{labels[record.kind][1]}</span>
              <strong>{title}</strong>
              {description && <span className="small muted">{description}</span>}
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="Nichts Passendes gefunden."
          description="Versuche einen anderen Namen oder Begriff."
        />
      )}
    </Modal>
  );
}
