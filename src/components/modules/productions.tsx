"use client";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight, CalendarDays, Plus, Users } from "lucide-react";
import type { Workspace } from "@/shared/contracts";
import { dateLabel, hours, ids, num, value } from "@/shared/client-api";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, Empty, ExportButton, PageHeader, Section } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail, ResourceView } from "../resource-view";
import { ExportDialog, ImportDialog } from "../export-dialog";
import { TasksModule } from "./tasks";
import { CalendarModule } from "./calendar";
import { TimeModule } from "./time";
import { statusLabels } from "../resource-fields";
export function ProductionsModule() {
  const { workspace } = useWorkspace();
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("overview");
  const [status, setStatus] = useState("current");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(false);
  const [details, setDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const production = workspace.records.productions.find((x) => x.id === selected);
  const records = workspace.records.productions.filter(
    (x) =>
      (status === "all" || status === "archived"
        ? status === "all" || x.data.status === "archived"
        : x.data.status !== "archived") &&
      value(x.data, "title").toLowerCase().includes(search.toLowerCase()),
  );
  const projectHours = (workspace as Workspace & { projectHours?: Record<string, number> })
    .projectHours;
  if (production)
    return (
      <>
        <div className="production-breadcrumb">
          <Button
            variant="ghost"
            onClick={() => {
              setSelected("");
              setTab("overview");
            }}
          >
            <ArrowLeft size={16} />
            Alle Produktionen
          </Button>
          <Badge tone="green">{value(production.data, "season") || "Spielzeit"}</Badge>
        </div>
        <header className="production-heading">
          <div>
            <p className="eyebrow">{statusLabels[value(production.data, "status")]}</p>
            <h1>{value(production.data, "title")}</h1>
          </div>
          <Button onClick={() => setDetails(true)}>Produktion verwalten</Button>
        </header>
        <div className="tabs">
          {[
            ["overview", "Überblick"],
            ["tasks", "Aufgaben"],
            ["casting", "Besetzung"],
            ["looks", "Aufschriebe"],
            ["calendar", "Kalender"],
            ["time", "Zeiten"],
            ["handovers", "Übergaben"],
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "overview" ? (
          <>
            <div className="project-overview">
              <Section title="Über die Produktion">
                <div className="panel-content">
                  <p>
                    {value(production.data, "description") ||
                      "Hier ist Raum für die wichtigsten Informationen zu diesem Stück."}
                  </p>
                  <dl className="detail-grid">
                    <div>
                      <dt>Premiere</dt>
                      <dd>{dateLabel(value(production.data, "premiere"))}</dd>
                    </div>
                    <div>
                      <dt>Projektteam</dt>
                      <dd>
                        {ids(production.data, "memberIds")
                          .map((id) => workspace.members.find((x) => x.id === id)?.name)
                          .filter(Boolean)
                          .join(", ") || "Noch nicht zugeteilt"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </Section>
              <section className="project-stats">
                <p className="eyebrow">GEMEINSAME ARBEIT</p>
                <strong>
                  {hours(
                    projectHours?.[production.id] ??
                      workspace.records.time
                        .filter((x) => x.data.productionId === production.id)
                        .reduce((sum, x) => sum + num(x.data, "durationSeconds"), 0),
                  )}
                  <span>Stunden</span>
                </strong>
                <p className="muted small">
                  Gebuchte Produktionszeit aller freigegebenen Buchungen.
                </p>
                <Button onClick={() => setTab("time")}>
                  Zeitübersicht öffnen
                  <ArrowUpRight size={16} />
                </Button>
              </section>
            </div>
            <div className="overview-links">
              {[
                [
                  "tasks",
                  "Offene Aufgaben",
                  workspace.records.tasks.filter(
                    (x) => x.data.productionId === production.id && x.data.status !== "done",
                  ).length,
                ],
                [
                  "casting",
                  "Figuren & Besetzungen",
                  workspace.records.characters.filter((x) => x.data.productionId === production.id)
                    .length,
                ],
                [
                  "looks",
                  "Aufschriebe",
                  workspace.records.looks.filter((x) => x.data.productionId === production.id)
                    .length,
                ],
              ].map(([key, label, count]) => (
                <button key={key} onClick={() => setTab(String(key))}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </div>
          </>
        ) : tab === "tasks" ? (
          <TasksModule key={production.id} productionId={production.id} />
        ) : tab === "calendar" ? (
          <CalendarModule key={production.id} productionId={production.id} />
        ) : tab === "time" ? (
          <TimeModule key={production.id} productionId={production.id} />
        ) : tab === "casting" ? (
          <CastingModule productionId={production.id} />
        ) : (
          <ResourceView
            key={tab}
            kind={tab === "looks" ? "looks" : "handovers"}
            defaults={{ productionId: production.id }}
            filter={(x) => x.data.productionId === production.id}
            description={
              tab === "looks"
                ? "Aufschriebe, Bildgalerien und Arbeitsabläufe für diese Produktion."
                : "Checklisten, Absprachen und offene Punkte zu den Vorstellungen."
            }
          />
        )}
        {details && <RecordDetail record={production} onClose={() => setDetails(false)} />}
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow="JEDES STÜCK HAT SEINE GESCHICHTE"
        title="Produktionen"
        description="Euer gemeinsamer Überblick von der Vorbereitung bis zur Wiederaufnahme."
      >
        <ExportButton onClick={() => setExporting(true)} />
        {workspace.user.role !== "user" && (
          <Button onClick={() => setImporting(true)}>Importieren</Button>
        )}
        <Button variant="primary" onClick={() => setEditor(true)}>
          <Plus size={16} />
          Produktion anlegen
        </Button>
      </PageHeader>
      <div className="toolbar">
        <div className="segmented">
          {[
            ["current", "Aktuell"],
            ["archived", "Archiv"],
            ["all", "Alle"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={status === key ? "active" : ""}
              onClick={() => setStatus(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Produktion suchen …"
          aria-label="Produktion suchen"
        />
      </div>
      {records.length ? (
        <div className="production-grid">
          {records.map((project, i) => {
            const remaining = workspace.records.tasks.filter(
              (x) => x.data.productionId === project.id && x.data.status !== "done",
            ).length;
            return (
              <button
                className="production-card"
                key={project.id}
                onClick={() => setSelected(project.id)}
                style={
                  {
                    "--project-color": value(project.data, "color") || "#16735c",
                  } as React.CSSProperties
                }
              >
                <div className="production-card-top">
                  <span className="eyebrow">{value(project.data, "season") || "SPIELZEIT"}</span>
                  <Badge>{statusLabels[value(project.data, "status")]}</Badge>
                </div>
                <span className="production-number">{String(i + 1).padStart(2, "0")}</span>
                <h2>{value(project.data, "title")}</h2>
                <p>
                  {value(project.data, "description") ||
                    "Alle Aufgaben, Figuren und Aufschriebe für dieses Stück."}
                </p>
                <div className="production-card-meta">
                  <span>
                    <CalendarDays size={15} />
                    {project.data.premiere
                      ? `Premiere ${dateLabel(value(project.data, "premiere"))}`
                      : "Premiere noch offen"}
                  </span>
                  <span>
                    <Users size={15} />
                    {ids(project.data, "memberIds").length} im Team
                  </span>
                </div>
                <footer>
                  <span>{remaining} offene Aufgaben</span>
                  <ArrowUpRight size={20} />
                </footer>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            search || status === "archived"
              ? "Keine Produktionen in dieser Ansicht."
              : "Platz für euer nächstes Stück."
          }
          description="Lege eine Produktion an. Hier laufen Aufgaben, Besetzung, Dokumentation, Termine und Arbeitszeit zusammen."
          action="Erste Produktion anlegen"
          onAction={() => setEditor(true)}
        />
      )}
      {editor && <ResourceEditor kind="productions" onClose={() => setEditor(false)} />}
      {exporting && <ExportDialog kind="productions" onClose={() => setExporting(false)} />}
      {importing && <ImportDialog kind="productions" onClose={() => setImporting(false)} />}
    </>
  );
}
export function CastingModule({ productionId = "" }: { productionId?: string }) {
  const [tab, setTab] = useState("casting");
  return (
    <>
      <div className="tabs compact-tabs">
        <button className={tab === "casting" ? "active" : ""} onClick={() => setTab("casting")}>
          Besetzung
        </button>
        <button
          className={tab === "characters" ? "active" : ""}
          onClick={() => setTab("characters")}
        >
          Figuren & Bilder
        </button>
      </div>
      <ResourceView
        key={tab}
        kind={tab === "casting" ? "casting" : "characters"}
        defaults={{ productionId }}
        filter={productionId ? (record) => record.data.productionId === productionId : undefined}
        description={
          tab === "casting"
            ? "Figuren, Schauspieler und alternierende Besetzungen zuverlässig zuordnen."
            : "Figurenbeschreibungen und Bildgalerien für eure Stücke."
        }
      />
    </>
  );
}
