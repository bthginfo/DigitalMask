"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Pause, Play, Plus, Square, UploadCloud } from "lucide-react";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import {
  dateLabel,
  hours,
  instantDate,
  localDate,
  num,
  post,
  shiftDate,
  timeAllocations,
  value,
  weekStart,
} from "@/shared/client-api";
import { useStoredValue } from "@/shared/client-storage";
import { useWorkspace } from "../workspace-context";
import { Badge, Button, Empty, ErrorMessage, ExportButton, Modal, PageHeader } from "../ui";
import { ResourceEditor } from "../resource-editor";
import { RecordDetail } from "../resource-view";
import { ExportDialog } from "../export-dialog";
import { statusLabels } from "../resource-fields";
export function TimerPanel({ compact = false }: { compact?: boolean }) {
  const { workspace, action, busy } = useWorkspace();
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [category, setCategory] = useState("production");
  const timer = workspace.timer;
  useEffect(() => {
    if (!timer || timer.data.pausedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer]);
  const seconds = timer
    ? Math.max(
        0,
        Math.floor(
          ((timer.data.pausedAt ? new Date(String(timer.data.pausedAt)).getTime() : now) -
            new Date(String(timer.data.startedAt)).getTime()) /
            1000,
        ) - num(timer.data, "pauseSeconds"),
      )
    : 0;
  const display = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const run = async (name: string) => {
    setError("");
    try {
      await action(
        name,
        undefined,
        name === "timer-start" ? { title: title.trim(), productionId: project, category } : {},
      );
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Timer-Aktion fehlgeschlagen");
    }
  };
  return (
    <section className={`timer-panel ${compact ? "compact" : ""}`}>
      <header>
        <span className="eyebrow">
          <Clock3 size={14} />
          DEINE ZEIT ZÄHLT
        </span>
        {timer && (
          <Badge tone={timer.data.pausedAt ? "neutral" : "green"}>
            {timer.data.pausedAt ? "Pausiert" : "Timer läuft"}
          </Badge>
        )}
      </header>
      {timer ? (
        <>
          <p className="timer-value" aria-live="off">
            {display}
          </p>
          <p className="timer-caption">{value(timer.data, "title")}</p>
          <div className="timer-controls">
            <Button
              disabled={busy}
              onClick={() => void run(timer.data.pausedAt ? "timer-resume" : "timer-pause")}
            >
              {timer.data.pausedAt ? <Play size={15} /> : <Pause size={15} />}
              {timer.data.pausedAt ? "Fortsetzen" : "Pause"}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void run("timer-stop")}>
              <Square size={13} />
              Stoppen & buchen
            </Button>
            <Button
              variant="danger-ghost"
              disabled={busy}
              onClick={() => {
                if (confirm("Laufenden Timer ohne Zeitbuchung verwerfen?"))
                  void run("timer-discard");
              }}
            >
              Timer verwerfen
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="timer-value">
            00:00<span>:00</span>
          </p>
          <label>
            <span className="visually-hidden">Tätigkeit</span>
            <input
              placeholder="Woran arbeitest du?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="timer-selects">
            <select
              value={project}
              aria-label="Produktion für Timer"
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">Allgemeine Arbeit</option>
              {workspace.records.productions
                .filter((x) => x.data.status !== "archived")
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {value(x.data, "title")}
                  </option>
                ))}
            </select>
            <select
              value={category}
              aria-label="Tätigkeit"
              onChange={(e) => setCategory(e.target.value)}
            >
              {[
                ["production", "Produktion"],
                ["office", "Büro"],
                ["cleaning", "Aufräumen"],
                ["other", "Allgemein"],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="primary"
            disabled={busy || !title.trim()}
            onClick={() => void run("timer-start")}
          >
            <Play size={15} />
            Timer starten
          </Button>
        </>
      )}
      <ErrorMessage message={error} />
    </section>
  );
}
type Draft = { id: string; data: RecordData; createdAt: string };
export function TimeModule({ productionId = "" }: { productionId?: string }) {
  const { workspace, action, refresh, online, busy } = useWorkspace();
  const [week, setWeek] = useState(weekStart());
  const [person, setPerson] = useState(workspace.user.id);
  const [project, setProject] = useState(productionId);
  const [editor, setEditor] = useState(false);
  const [detail, setDetail] = useState<DomainRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [draftModal, setDraftModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const admin = workspace.user.role !== "user";
  const key = `digitalmask-time-drafts:${workspace.user.id}`;
  const [draftJson, setDraftJson] = useStoredValue(key, "[]");
  const drafts = useMemo<Draft[]>(() => {
    try {
      return JSON.parse(draftJson);
    } catch {
      return [];
    }
  }, [draftJson]);
  const [inboxJson, setInboxJson] = useStoredValue("digitalmask-offline-inbox", "[]");
  const inbox = useMemo<Draft[]>(() => {
    try {
      const parsed = JSON.parse(inboxJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [inboxJson]);
  const persist = (next: Draft[]) => setDraftJson(JSON.stringify(next));
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
    }
  };
  const sync = async () => {
    setSyncing(true);
    await run(async () => {
      let remaining = [...drafts];
      for (const draft of drafts) {
        await post("/api/records/time", { data: draft.data, idempotencyKey: draft.id });
        remaining = remaining.filter((x) => x.id !== draft.id);
        persist(remaining);
      }
      await refresh();
    });
    setSyncing(false);
  };
  const until = shiftDate(week, 6);
  const entries = workspace.records.time
    .filter(
      (x) =>
        value(x.data, "userId") === person &&
        timeAllocations(x.data).some((day) => day.date >= week && day.date <= until) &&
        (!project || x.data.productionId === project),
    )
    .sort((a, b) => value(b.data, "date").localeCompare(value(a.data, "date")));
  const total = entries
    .flatMap((x) => timeAllocations(x.data))
    .filter((day) => day.date >= week && day.date <= until)
    .reduce((sum, day) => sum + day.seconds, 0);
  const sheets = workspace.records.timesheets.filter(
    (x) => admin || x.data.userId === workspace.user.id,
  );
  return (
    <>
      <PageHeader
        eyebrow="WENIGER ZETTEL. MEHR ÜBERBLICK."
        title="Zeit buchen"
        description="Produktionsarbeit und allgemeine Tätigkeiten. Tages- und Wochensummen rechnen sich von selbst."
      >
        <ExportButton onClick={() => setExporting(true)} />
        <Button onClick={() => setDraftModal(true)}>Offlineentwurf</Button>
        <Button variant="primary" onClick={() => setEditor(true)}>
          <Plus size={16} />
          Zeit nachtragen
        </Button>
      </PageHeader>
      <div className="time-layout">
        <TimerPanel />
        <section className="time-summary">
          <p className="eyebrow">DEINE WOCHE</p>
          <strong>
            {hours(total)} <span>Stunden</span>
          </strong>
          <div className="week-bars">
            {Array.from({ length: 7 }, (_, i) => {
              const date = shiftDate(week, i);
              const seconds = entries
                .flatMap((x) => timeAllocations(x.data))
                .filter((day) => day.date === date)
                .reduce((sum, day) => sum + day.seconds, 0);
              return (
                <div key={date}>
                  <span className="small">{hours(seconds)}h</span>
                  <div className="bar-track">
                    <span style={{ height: `${Math.min(100, (seconds / (8 * 3600)) * 100)}%` }} />
                  </div>
                  <span className="small muted">
                    {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][i]}
                  </span>
                </div>
              );
            })}
          </div>
          <Button
            disabled={busy || !entries.length || person !== workspace.user.id}
            onClick={() => void run(() => action("timesheet-submit", undefined, { week }))}
          >
            <Check size={16} />
            Woche zur Freigabe einreichen
          </Button>
        </section>
      </div>
      {inbox.length > 0 && (
        <div className="offline-banner">
          <div>
            <strong>{inbox.length} unzugeordnete Geräteentwürfe</strong>
            <p className="small">
              Diese Offlinebuchungen gehören noch zu keinem Account. Übernimm nur deine eigenen
              Tätigkeiten als {workspace.user.name}.
            </p>
          </div>
          <Button
            onClick={() => {
              persist([
                ...drafts,
                ...inbox.filter((item) => !drafts.some((draft) => draft.id === item.id)),
              ]);
              setInboxJson("[]");
            }}
          >
            In meinen Account übernehmen
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("Alle unzugeordneten Geräteentwürfe auf diesem Gerät verwerfen?"))
                setInboxJson("[]");
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
      {drafts.length > 0 && (
        <div className="offline-banner">
          <div>
            <strong>{drafts.length} lokale Zeitentwürfe</strong>
            <p className="small">
              Nur auf diesem Gerät gespeichert. Bitte synchronisieren, bevor du dich abmeldest.
            </p>
          </div>
          <Button disabled={!online || syncing} onClick={() => void sync()}>
            <UploadCloud size={16} />
            {syncing ? "Synchronisiert …" : "Jetzt synchronisieren"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("Alle lokalen Zeitentwürfe verwerfen?")) persist([]);
            }}
          >
            Verwerfen
          </Button>
        </div>
      )}
      <div className="toolbar wrap">
        <label className="inline-label">
          Woche ab
          <input
            type="date"
            value={week}
            onChange={(e) => setWeek(weekStart(instantDate(e.target.value)))}
          />
        </label>
        {admin && (
          <select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
            {workspace.members.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Produktion"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">Alle Tätigkeiten</option>
          {workspace.records.productions.map((x) => (
            <option key={x.id} value={x.id}>
              {value(x.data, "title")}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage message={error} />
      {entries.length ? (
        <div className="table-scroll panel">
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Tätigkeit</th>
                <th>Produktion</th>
                <th>Dauer</th>
                <th>Pause</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.id}>
                  <td>{dateLabel(value(row.data, "date"))}</td>
                  <td>
                    <button className="text-button strong" onClick={() => setDetail(row)}>
                      {value(row.data, "title")}
                    </button>
                    <span className="small muted">{statusLabels[value(row.data, "category")]}</span>
                  </td>
                  <td>
                    {(workspace.records.productions.find((x) => x.id === row.data.productionId)
                      ?.data.title as string) || "Allgemein"}
                  </td>
                  <td className="strong">{hours(num(row.data, "durationSeconds"))} h</td>
                  <td>{Math.round(num(row.data, "pauseSeconds") / 60)} min</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Wochensumme</td>
                <td colSpan={2}>{hours(total)} h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <Empty
          title="Noch keine Zeit in dieser Woche."
          description="Starte den Timer oder trage eine Tätigkeit nach. Du kannst auch ohne Produktion Büro- und Aufräumzeit buchen."
          action="Zeit buchen"
          onAction={() => setEditor(true)}
        />
      )}
      <section className="panel margin-top">
        <header className="panel-heading">
          <h2>{admin ? "Wochenfreigaben im Team" : "Meine Wochenfreigaben"}</h2>
        </header>
        {!sheets.length ? (
          <p className="empty-inline">Noch keine Wochen eingereicht.</p>
        ) : (
          <div className="list">
            {sheets.map((sheet) => (
              <div className="list-row" key={sheet.id}>
                <div>
                  <strong>{workspace.members.find((x) => x.id === sheet.data.userId)?.name}</strong>
                  <p className="small muted">
                    Woche ab {dateLabel(value(sheet.data, "week"))} · {value(sheet.data, "note")}
                  </p>
                </div>
                <Badge tone={sheet.data.status === "approved" ? "green" : "neutral"}>
                  {statusLabels[value(sheet.data, "status")]}
                </Badge>
                {admin && (
                  <>
                    {sheet.data.status !== "approved" && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            action("timesheet-decide", sheet.id, { status: "approved" }),
                          )
                        }
                      >
                        Freigeben
                      </Button>
                    )}
                    <Button
                      disabled={busy}
                      onClick={() => {
                        const note = prompt("Welche Korrektur wird benötigt?");
                        if (note)
                          void run(() =>
                            action("timesheet-decide", sheet.id, {
                              status: "changes_requested",
                              note,
                            }),
                          );
                      }}
                    >
                      Korrektur
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      {editor && (
        <ResourceEditor
          kind="time"
          defaults={{ productionId: project }}
          onClose={() => setEditor(false)}
        />
      )}
      {detail && <RecordDetail record={detail} onClose={() => setDetail(null)} />}
      {exporting && (
        <ExportDialog
          kind="time"
          filters={{
            userId: person,
            from: week,
            to: until,
            ...(project ? { productionId: project } : {}),
          }}
          onClose={() => setExporting(false)}
        />
      )}
      {draftModal && (
        <Modal title="Zeit offline als Entwurf speichern" onClose={() => setDraftModal(false)}>
          <p className="muted">
            Dieser Entwurf bleibt nur in deinem Browser. Er wird erst nach deiner ausdrücklichen
            Synchronisierung im Theater gespeichert.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              persist([
                ...drafts,
                {
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString(),
                  data: {
                    title: form.get("title"),
                    date: form.get("date"),
                    productionId: form.get("productionId"),
                    category: form.get("category"),
                    durationSeconds: Number(form.get("minutes")) * 60,
                    pauseSeconds: 0,
                  },
                },
              ]);
              setDraftModal(false);
            }}
          >
            <label>
              Tätigkeit
              <input name="title" required />
            </label>
            <div className="form-grid">
              <label>
                Datum
                <input name="date" type="date" defaultValue={localDate()} required />
              </label>
              <label>
                Minuten
                <input name="minutes" type="number" min="1" required />
              </label>
              <label>
                Produktion
                <select name="productionId">
                  <option value="">Allgemein</option>
                  {workspace.records.productions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {value(x.data, "title")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kategorie
                <select name="category">
                  <option value="production">Produktion</option>
                  <option value="office">Büro</option>
                  <option value="cleaning">Aufräumen</option>
                  <option value="other">Allgemein</option>
                </select>
              </label>
            </div>
            <footer className="dialog-footer">
              <Button onClick={() => setDraftModal(false)}>Abbrechen</Button>
              <Button type="submit" variant="primary">
                Lokal speichern
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
