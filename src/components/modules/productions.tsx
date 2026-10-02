"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, CalendarDays, Plus, Users } from "lucide-react";
import { PeriodPicker, periodExportFilters } from "@/components/period-picker";
import { recordMatchesPeriod, seasonForDate, type PeriodFilter } from "@/shared/period-filter";
import { contactsValue } from "@/shared/contracts";
import { productionContactName } from "@/shared/production-contacts";
import { productionCastingCounts } from "@/modules/productions/counts";
import type { Workspace } from "@/shared/contracts";
import { dateLabel, hours, ids, localDate, num, value } from "@/shared/client-api";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, Empty, ExportButton, PageHeader, Section } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail, ResourceView } from "../resource-view";
import { ExportDialog, ImportDialog } from "../export-dialog";
import { ProductionTeamModule } from "../production-people";
import { ChatModule } from "./chat";
import { TasksModule } from "./tasks";
import { CalendarModule } from "./calendar";
import { TimeModule } from "./time";
import { statusLabels } from "../resource-fields";
import { RecordDocuments } from "@/modules/documents/components/record-documents";
const productionTabs = [
  "overview",
  "team",
  "casting",
  "tasks",
  "looks",
  "documents",
  "calendar",
  "time",
  "chat",
];
export function ProductionsModule({
  productionId = "",
  activeTab = "overview",
  onNavigate,
}: {
  productionId?: string;
  activeTab?: string;
  onNavigate: (id: string, tab: string) => void;
}) {
  const { workspace } = useWorkspace();
  const selected = productionId;
  const tab = productionTabs.includes(activeTab) ? activeTab : "overview";
  const setSelected = (id: string) => onNavigate(id, "overview");
  const setTab = (next: string) => onNavigate(selected, next);
  const [period, setPeriod] = useState<PeriodFilter>(() => ({
    season: seasonForDate(workspace.records.productions),
  }));
  const [status, setStatus] = useState("current");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("premiere");
  const makeupNames = (data: Record<string, unknown>) =>
    [
      ...new Set(
        contactsValue(data.contacts)
          .filter((contact) => contact.type === "makeup")
          .map((contact) =>
            productionContactName(contact, workspace.members, workspace.records.people),
          ),
      ),
    ].join(", ");
  const [editor, setEditor] = useState(false);
  const [details, setDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = tabs.current;
    const button = container?.querySelector<HTMLButtonElement>("button[aria-current='page']");
    if (!container || !button) return;
    const viewport = container.getBoundingClientRect();
    const target = button.getBoundingClientRect();
    if (target.left < viewport.left || target.right > viewport.right) {
      container.scrollTo({
        left:
          container.scrollLeft +
          target.left -
          viewport.left -
          (container.clientWidth - target.width) / 2,
        behavior: "instant",
      });
    }
  }, [selected, tab]);
  const production = workspace.records.productions.find((x) => x.id === selected);
  const castingCounts = productionCastingCounts(
    selected,
    workspace.records.characters,
    workspace.records.casting,
  );
  const records = workspace.records.productions.filter(
    (x) =>
      (status === "all" || status === "archived"
        ? status === "all" || x.data.status === "archived"
        : x.data.status !== "archived") &&
      recordMatchesPeriod(x, period, workspace.records.productions) &&
      value(x.data, "title").toLowerCase().includes(search.toLowerCase()),
  );
  records.sort((a, b) => {
    if (sort === "name" || sort === "name-desc")
      return (
        value(a.data, "title").localeCompare(value(b.data, "title"), "de") *
        (sort === "name-desc" ? -1 : 1)
      );
    if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
    const left = value(a.data, "premiere"),
      right = value(b.data, "premiere"),
      today = localDate();
    const rank = (date: string) => (!date ? 2 : date >= today ? 0 : 1);
    return (
      rank(left) - rank(right) ||
      (rank(left) === 1 ? right.localeCompare(left) : left.localeCompare(right)) ||
      value(a.data, "title").localeCompare(value(b.data, "title"), "de")
    );
  });
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
        <div ref={tabs} className="tabs production-tabs" aria-label="Produktionsbereiche">
          {[
            ["overview", "Überblick"],
            ["team", "Team & Kontakte"],
            ["casting", "Besetzung"],
            ["tasks", "Aufgaben & Sprints"],
            ["looks", "Aufschriebe"],
            ["documents", "Dokumente"],
            ["calendar", "Kalender"],
            ["time", "Zeiten"],
            ["chat", "Projektchat"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-current={tab === key ? "page" : undefined}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "overview" ? (
          <>
            <section className="production-makeup-contact">
              <Users size={22} />
              <div>
                <span className="eyebrow">MASKENBETREUUNG</span>
                <strong>
                  {makeupNames(production.data) || "Noch keine Maskenbetreuung eingetragen"}
                </strong>
                <p className="small muted">Deine Ansprechpersonen für dieses Stück.</p>
              </div>
              <Button onClick={() => setTab("team")}>Team & Kontakte</Button>
            </section>
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
                ["casting", "Figuren", castingCounts.characters],
                ["casting", "Besetzungen", castingCounts.casting],
                [
                  "looks",
                  "Aufschriebe",
                  workspace.records.looks.filter((x) => x.data.productionId === production.id)
                    .length,
                ],
              ].map(([key, label, count]) => (
                <button key={label} onClick={() => setTab(String(key))}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </div>
          </>
        ) : tab === "team" ? (
          <ProductionTeamModule key={production.id} production={production} />
        ) : tab === "chat" ? (
          <ChatModule key={production.id} productionId={production.id} />
        ) : tab === "tasks" ? (
          <TasksModule key={production.id} productionId={production.id} />
        ) : tab === "calendar" ? (
          <CalendarModule key={production.id} productionId={production.id} />
        ) : tab === "time" ? (
          <TimeModule key={production.id} productionId={production.id} />
        ) : tab === "casting" ? (
          <CastingModule key={production.id} productionId={production.id} />
        ) : tab === "documents" ? (
          <RecordDocuments key={production.id} record={production} />
        ) : (
          <ResourceView
            key={`${production.id}:${tab}`}
            kind={tab === "looks" ? "looks" : "handovers"}
            lockedProductionId={production.id}
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
      <PeriodPicker
        records={workspace.records.productions}
        productions={workspace.records.productions}
        value={period}
        onChange={setPeriod}
      />
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
      <label className="production-sort">
        Sortieren nach
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="premiere">Premiere</option>
          <option value="name">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="updated">Zuletzt geändert</option>
        </select>
      </label>
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
                <div className="production-card-makeup">
                  <Users size={15} />
                  <span>
                    <span className="small muted">Maskenbetreuung</span>
                    <strong>{makeupNames(project.data) || "Noch offen"}</strong>
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
      {editor && (
        <ResourceEditor
          kind="productions"
          defaults={{ season: period.season || seasonForDate(workspace.records.productions) }}
          onClose={() => setEditor(false)}
        />
      )}
      {exporting && (
        <ExportDialog
          kind="productions"
          filters={periodExportFilters(period)}
          onClose={() => setExporting(false)}
        />
      )}
      {importing && <ImportDialog kind="productions" onClose={() => setImporting(false)} />}
    </>
  );
}
export function CastingModule({ productionId = "" }: { productionId?: string }) {
  return (
    <ResourceView
      kind="casting"
      title="Besetzung"
      lockedProductionId={productionId}
      defaults={{ productionId }}
      filter={productionId ? (record) => record.data.productionId === productionId : undefined}
    />
  );
}
