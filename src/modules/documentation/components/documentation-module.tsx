"use client";
import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { documentSections, sectionName, lookTitle } from "@/shared/document-sections";
import { initialPeriod, recordMatchesPeriod, type PeriodFilter } from "@/shared/period-filter";
import { value } from "@/shared/client-api";
import { useWorkspace } from "@/components/workspace-context";
import { Button, Empty, ExportButton, PageHeader } from "@/components/ui";
import { PeriodPicker, periodExportFilters } from "@/components/period-picker";
import { RecordDetail, ResourceView } from "@/components/resource-view";
import { ResourceEditor } from "@/components/resource-editor";
import { ExportDialog } from "@/components/export-dialog";
import { CategoryManager } from "@/modules/categories/components/category-manager";
import { useViewState } from "@/shared/view-state";
export function DocumentationModule() {
  const { workspace } = useWorkspace();
  const [tab, setTab] = useViewState(workspace.user.id, "documentation", "tab", "looks"),
    [production, setProduction] = useViewState(
      workspace.user.id,
      "documentation",
      "production",
      "",
    ),
    [search, setSearch] = useViewState(workspace.user.id, "documentation", "search", ""),
    [period, setPeriod] = useViewState<PeriodFilter>(
      workspace.user.id,
      "documentation",
      "period",
      () => initialPeriod(workspace.records.productions),
    ),
    [editing, setEditing] = useState(false),
    [detail, setDetail] = useState<DomainRecord | null>(null),
    [exporting, setExporting] = useState(false),
    [categoriesOpen, setCategoriesOpen] = useState(false);
  const rows = workspace.records.looks.filter(
    (row) =>
      (!production ||
        (production === "general"
          ? !row.data.productionId
          : row.data.productionId === production)) &&
      recordMatchesPeriod(row, period, workspace.records.productions) &&
      (!search ||
        JSON.stringify({
          ...row.data,
          actorName: lookTitle(row.data, workspace.records.actors),
          characterName: value(
            workspace.records.characters.find((figure) => figure.id === row.data.characterId)
              ?.data || {},
            "name",
          ),
          categories: documentSections(row.data, "looks").map((section) =>
            sectionName(section.key, "looks", workspace.records.categories),
          ),
        })
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const groupIds = [...new Set(rows.map((row) => value(row.data, "productionId")))].sort((a, b) =>
    !a
      ? -1
      : !b
        ? 1
        : value(
            workspace.records.productions.find((row) => row.id === a)?.data || {},
            "title",
          ).localeCompare(
            value(workspace.records.productions.find((row) => row.id === b)?.data || {}, "title"),
            "de",
          ),
  );
  return (
    <>
      <div className="tabs compact-tabs">
        <button className={tab === "looks" ? "active" : ""} onClick={() => setTab("looks")}>
          Sammelordner
        </button>
        <button className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>
          Vorlagen
        </button>
      </div>
      {tab === "templates" ? (
        <ResourceView
          kind="templates"
          description="Wiederverwendbare Abschnitte und Textfelder. Individuelle Vorlagenfelder bleiben erhalten."
        />
      ) : (
        <>
          <PageHeader
            eyebrow="WISSEN FÜR EUER TEAM"
            title="Aufschriebe"
            description="Allgemeine Aufschriebe und Produktionswissen, auch aus vergangenen Spielzeiten."
          >
            <ExportButton onClick={() => setExporting(true)} />
            {workspace.user.role !== "user" && (
              <Button onClick={() => setCategoriesOpen(true)}>Abschnitte verwalten</Button>
            )}
            <Button variant="primary" onClick={() => setEditing(true)}>
              <Plus size={15} />
              Aufschrieb anlegen
            </Button>
          </PageHeader>
          <div className="toolbar wrap">
            <label className="inline-label">
              Sammelordner
              <select value={production} onChange={(event) => setProduction(event.target.value)}>
                <option value="">Alle Aufschriebe</option>
                <option value="general">Allgemeine Aufschriebe</option>
                {workspace.records.productions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {value(row.data, "title")}
                    {row.data.status === "archived" ? " · Archiv" : ""}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="search-input"
              aria-label="Aufschriebe durchsuchen"
              placeholder="Person, Figur, Kategorie oder Text …"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <PeriodPicker
            records={workspace.records.looks}
            productions={workspace.records.productions}
            value={period}
            onChange={setPeriod}
          />
          {groupIds.length ? (
            groupIds.map((id) => {
              const project = workspace.records.productions.find((row) => row.id === id);
              return (
                <section className="document-folder" key={id || "general"}>
                  <header>
                    <div>
                      <span className="eyebrow">
                        {project?.data.status === "archived"
                          ? "ARCHIVIERTE PRODUKTION"
                          : id
                            ? "PRODUKTION"
                            : "GEMEINSAMER SAMMELORDNER"}
                      </span>
                      <h2>
                        {id
                          ? value(project?.data || {}, "title") || "Frühere Produktion"
                          : "Allgemeine Aufschriebe"}
                      </h2>
                    </div>
                    <span className="small muted">
                      {rows.filter((row) => value(row.data, "productionId") === id).length}{" "}
                      Aufschriebe
                    </span>
                  </header>
                  <div className="document-folder-records">
                    {rows
                      .filter((row) => value(row.data, "productionId") === id)
                      .map((row) => (
                        <button key={row.id} onClick={() => setDetail(row)}>
                          <FileText size={20} />
                          <div>
                            <h3>{lookTitle(row.data, workspace.records.actors)}</h3>
                            <p className="small muted">
                              {value(
                                workspace.records.characters.find(
                                  (figure) => figure.id === row.data.characterId,
                                )?.data || {},
                                "name",
                              ) ||
                                value(row.data, "characterName") ||
                                "Ohne Figur"}
                            </p>
                          </div>
                          <span className="small muted">
                            {Array.isArray(row.data.imageIds) ? row.data.imageIds.length : 0} Bilder
                          </span>
                        </button>
                      ))}
                  </div>
                </section>
              );
            })
          ) : (
            <Empty
              title="Keine Aufschriebe in dieser Auswahl."
              description="Ändere den Suchtext oder Zeitraum, oder lege einen allgemeinen Aufschrieb an."
            />
          )}
        </>
      )}
      {editing && (
        <ResourceEditor
          kind="looks"
          defaults={{ productionId: production === "general" ? "" : production }}
          onClose={() => setEditing(false)}
          onSaved={setDetail}
        />
      )}{" "}
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}{" "}
      {categoriesOpen && <CategoryManager scope="looks" onClose={() => setCategoriesOpen(false)} />}{" "}
      {exporting && (
        <ExportDialog
          kind="looks"
          filters={{
            ...periodExportFilters(period),
            ...(production && production !== "general"
              ? { productionId: production }
              : production === "general"
                ? { generalOnly: "true" }
                : {}),
          }}
          onClose={() => setExporting(false)}
        />
      )}
    </>
  );
}
