"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  MoreHorizontal,
  Download,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button, Empty, ErrorMessage, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { ApiFailure, value } from "@/shared/client-api";
import { contactsValue, type DomainRecord } from "@/shared/contracts";
import { isActiveStaff } from "@/shared/client-members";
import { maskPlanSchema } from "../schema";
import {
  cloneMaskPlan,
  maskPlanBlockLabel,
  maskPlanOverlaps,
  maskPlanValue,
  newMaskPlan,
  type MaskPlanBlock,
  type MaskPlanData,
  type MaskPlanLane,
} from "../model";
import { BlockEditor, LaneEditor, PlanOptions } from "./plan-editors";
import { Timetable } from "./timetable";
import styles from "./mask-plans.module.css";

type Draft = { data: MaskPlanData; base?: DomainRecord };
type Editor =
  | ((
      | { type: "options"; creating: boolean; plan: MaskPlanData }
      | { type: "lane"; creating: boolean; lane: MaskPlanLane }
      | { type: "block"; creating: boolean; block: MaskPlanBlock }
    ) & { base?: DomainRecord; snapshot?: MaskPlanData })
  | null;

function updateLocation(id: string, push = false) {
  const next = new URL(location.href);
  if (id) next.searchParams.set("record", id);
  else next.searchParams.delete("record");
  history[push ? "pushState" : "replaceState"]({}, "", next.pathname + next.search);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function MaskPlansModule({ production }: { production: DomainRecord }) {
  const { workspace, save, remove, refresh, busy, online, notify } = useWorkspace();
  const plans = workspace.records.maskPlans.filter(
    (record) => record.data.productionId === production.id,
  );
  const [selectedId, setSelectedId] = useState(() => {
    const queryId =
      typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("record");
    return plans.find((record) => record.id === queryId)?.id || plans[0]?.id || "";
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [editing, setEditing] = useState(false);
  const [performanceTime, setPerformanceTime] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState(false);
  const dragSnapshot = useRef<Draft | null>(null);
  const selected =
    plans.find((record) => record.id === selectedId) || (!draft ? plans[0] : undefined);
  const dirty =
    !!draft &&
    (!draft.base || JSON.stringify(draft.data) !== JSON.stringify(maskPlanValue(draft.base.data)));
  const plan = dirty ? draft!.data : selected ? maskPlanValue(selected.data) : null;
  const compact = !!plan && !editing && !dirty;
  const remoteChanged =
    dirty &&
    !!draft?.base &&
    (selected?.id !== draft.base.id || selected.version !== draft.base.version);
  const latest = useRef({ dirty, selectedId: selected?.id || selectedId, plans });
  useEffect(() => {
    latest.current = {
      dirty: dirty || editor !== null,
      selectedId: selected?.id || selectedId,
      plans,
    };
  });

  useEffect(() => {
    const changed = () => {
      const url = new URL(location.href);
      if (
        url.searchParams.get("productionId") !== production.id ||
        url.searchParams.get("tab") !== "mask-plan"
      )
        return;
      const id = url.searchParams.get("record") || "";
      const current = latest.current;
      if (!id || id === current.selectedId || !current.plans.some((record) => record.id === id))
        return;
      if (
        current.dirty &&
        !confirm("Den anderen Maskenplan öffnen und deine ungespeicherten Änderungen verwerfen?")
      ) {
        updateLocation(current.selectedId);
        return;
      }
      latest.current = { ...current, selectedId: id, dirty: false };
      setSelectedId(id);
      setDraft(null);
      setEditing(false);
      setConflict(false);
      setError("");
      setEditor(null);
    };
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, [production.id]);
  useEffect(() => {
    if (!dirty && !editor) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, editor]);

  const guard = () => !dirty || confirm("Deine ungespeicherten Änderungen verwerfen?");
  const reset = () => {
    setDraft(null);
    setEditing(false);
    setConflict(false);
    setError("");
  };
  const changePlan = (id: string) => {
    if (id === selected?.id || !guard()) return;
    latest.current = { ...latest.current, selectedId: id, dirty: false };
    setSelectedId(id);
    reset();
    setEditor(null);
    updateLocation(id, true);
  };
  const change = (data: MaskPlanData, base?: DomainRecord) => {
    setDraft({ data, base: dirty ? draft?.base : base || selected });
    setError("");
  };
  const openEditor = (next: Exclude<Editor, null>, origin?: Draft) => {
    if (!(next.type === "options" && next.creating)) setEditing(true);
    setEditor({
      ...next,
      base: origin ? origin.base : dirty ? draft?.base : selected,
      snapshot: origin?.data || plan || undefined,
    });
  };
  const beginNew = () => {
    if (!guard()) return;
    openEditor({ type: "options", creating: true, plan: newMaskPlan(production.id) });
  };
  const addLane = () => {
    if (!plan) return;
    const contacts = plan.lanes.length
      ? []
      : contactsValue(production.data.contacts).filter((contact) => contact.type === "makeup");
    const memberIds = [
      ...new Set(
        contacts
          .map((contact) => contact.memberId)
          .filter((id) =>
            workspace.members.some((member) => member.id === id && isActiveStaff(member)),
          ),
      ),
    ];
    const staffNames = [
      ...new Set(
        contacts
          .filter((contact) => !memberIds.includes(contact.memberId))
          .map(
            (contact) =>
              value(
                workspace.records.people.find((person) => person.id === contact.personId)?.data ||
                  {},
                "name",
              ) || contact.name,
          )
          .filter(Boolean),
      ),
    ];
    openEditor({
      type: "lane",
      creating: true,
      lane: { id: crypto.randomUUID(), label: "", memberIds, staffNames },
    });
  };
  const addBlock = (laneId = plan?.lanes[0]?.id || "", startMinutes = -30) => {
    if (!plan || !laneId || plan.blocks.length >= 250) return;
    openEditor(
      {
        type: "block",
        creating: true,
        block: {
          id: crypto.randomUUID(),
          laneId,
          startMinutes,
          durationMinutes: Math.min(15, -startMinutes),
          actorIds: [],
          actorNames: [],
          title: "",
          notes: "",
          color: "",
        },
      },
      dragSnapshot.current || undefined,
    );
  };
  const moveBlock = (id: string, laneId: string, startMinutes: number) => {
    const origin =
      dragSnapshot.current || (plan ? { data: plan, base: dirty ? draft?.base : selected } : null);
    if (!origin) return;
    const original = origin.data.blocks.find((block) => block.id === id);
    if (!original || (original.laneId === laneId && original.startMinutes === startMinutes)) return;
    setDraft({
      data: {
        ...origin.data,
        blocks: origin.data.blocks.map((block) =>
          block.id === id ? { ...block, laneId, startMinutes } : block,
        ),
      },
      base: origin.base,
    });
    setError("");
  };
  const castings = workspace.records.casting.filter(
    (record) => record.data.productionId === production.id,
  );
  const castActorIds = new Set(castings.map((record) => value(record.data, "actorId")));
  const castActors = workspace.records.actors
    .filter((record) => castActorIds.has(record.id))
    .sort((left, right) => value(left.data, "name").localeCompare(value(right.data, "name"), "de"));
  const castNames = [
    ...new Set(castings.map((record) => value(record.data, "actorName")).filter(Boolean)),
  ];
  const overlaps = plan ? maskPlanOverlaps(plan) : [];
  const conflictVisible = conflict || remoteChanged;

  const savePlan = async () => {
    if (!plan || !dirty || pending) return;
    setError("");
    setPending(true);
    try {
      const parsed = maskPlanSchema.safeParse(plan);
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message || "Bitte prüfe den Maskenplan.");
      const saved = await save("maskPlans", parsed.data, draft?.base);
      latest.current = { ...latest.current, selectedId: saved.id, dirty: false };
      setSelectedId(saved.id);
      reset();
      updateLocation(saved.id);
      notify("Maskenplan gespeichert.");
    } catch (exception) {
      if (exception instanceof ApiFailure && exception.status === 409) setConflict(true);
      else setError(exception instanceof Error ? exception.message : "Speichern fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  };
  const reload = async () => {
    if (!guard()) return;
    setPending(true);
    try {
      await refresh();
      reset();
    } finally {
      setPending(false);
    }
  };
  const beginDrag = () => {
    if (plan) dragSnapshot.current = { data: plan, base: dirty ? draft?.base : selected };
  };
  const cancelDrag = () => {
    dragSnapshot.current = null;
  };
  const timetableProps = {
    plan: plan!,
    compact,
    members: workspace.members,
    actors: workspace.records.actors,
    performanceTime,
    productionColor: value(production.data, "color"),
    onEditLane: (lane: MaskPlanLane) => openEditor({ type: "lane", creating: false, lane }),
    onEditBlock: (block: MaskPlanBlock) => openEditor({ type: "block", creating: false, block }),
    onAddBlock: addBlock,
    onMoveBlock: moveBlock,
    onDragStart: beginDrag,
    onDragCancel: cancelDrag,
  };

  return (
    <section
      className={styles.module}
      data-dirty={dirty}
      data-compact={compact}
      aria-label="Maskenpläne dieser Produktion"
    >
      <header className={styles.heading}>
        <div>
          <h2>Maskenplan</h2>
          {compact ? (
            <span className={styles.savedIndicator} role="status">
              <Check size={13} /> Gespeichert
            </span>
          ) : (
            <span className={styles.planCount}>
              {plans.length} {plans.length === 1 ? "gespeicherter Plan" : "gespeicherte Pläne"}
            </span>
          )}
        </div>
        <Button onClick={beginNew} disabled={busy || pending}>
          <Plus size={16} />
          Neuer Plan
        </Button>
      </header>
      {plan ? (
        <>
          <div className={styles.planBar}>
            <label className={styles.planSelect}>
              Plan auswählen
              <select
                value={dirty && !draft?.base ? "new" : selected?.id || ""}
                onChange={(event) => changePlan(event.target.value)}
                disabled={pending}
              >
                {dirty && !draft?.base && <option value="new">{plan.title} · neuer Entwurf</option>}
                {plans.map((record) => (
                  <option key={record.id} value={record.id}>
                    {value(record.data, "title")}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.planActions}>
              {compact && (
                <Button variant="primary" onClick={() => setEditing(true)} disabled={pending}>
                  <Pencil size={16} />
                  Plan bearbeiten
                </Button>
              )}
              {dirty && (
                <div className={styles.desktopSave}>
                  <Button
                    variant="primary"
                    onClick={() => void savePlan()}
                    disabled={busy || pending || conflictVisible || !online}
                  >
                    <Save size={17} />
                    Speichern
                  </Button>
                </div>
              )}
              <details className={styles.moreActions}>
                <summary className="button" aria-label="Planoptionen">
                  <MoreHorizontal size={17} />
                  <span className={styles.moreLabel}>Planoptionen</span>
                </summary>
                <div className={styles.moreMenu}>
                  <Button
                    onClick={() => openEditor({ type: "options", creating: false, plan })}
                    disabled={pending}
                  >
                    <Settings2 size={16} />
                    Name &amp; Vorlauf
                  </Button>
                  <Button
                    onClick={() => {
                      setDraft({
                        data: {
                          ...cloneMaskPlan(plan),
                          title: `${plan.title} – Kopie`.slice(0, 200),
                        },
                      });
                      setSelectedId("");
                      setConflict(false);
                      setError("");
                      updateLocation("");
                    }}
                    disabled={pending}
                  >
                    <Copy size={16} />
                    Duplizieren
                  </Button>
                  {selected && !(dirty && !draft?.base) && (
                    <Button
                      variant="danger-ghost"
                      disabled={pending || busy}
                      onClick={async () => {
                        if (
                          !confirm(
                            `Maskenplan „${value(selected.data, "title")}“ mit allen Personalspalten und Zeitblöcken löschen?${dirty ? " Auch dein ungespeicherter Entwurf wird verworfen." : ""}`,
                          )
                        )
                          return;
                        setPending(true);
                        setError("");
                        try {
                          await remove(selected);
                          reset();
                          const next = plans.find((record) => record.id !== selected.id)?.id || "";
                          setSelectedId(next);
                          updateLocation(next);
                        } catch (exception) {
                          setError(
                            exception instanceof Error
                              ? exception.message
                              : "Löschen fehlgeschlagen.",
                          );
                        } finally {
                          setPending(false);
                        }
                      }}
                    >
                      <Trash2 size={16} />
                      Löschen
                    </Button>
                  )}
                </div>
              </details>
              <Button
                onClick={() => setExporting(true)}
                disabled={dirty || !selected || pending}
                title={
                  dirty
                    ? "Speichere deine Änderungen vor dem Export."
                    : "PDF, Excel, CSV oder JSON herunterladen"
                }
              >
                <Download size={16} />
                Exportieren
              </Button>
            </div>
          </div>
          <div className={styles.planTitle}>
            <h3>{plan.title}</h3>
          </div>
          {conflictVisible && (
            <div className={styles.conflict} role="alert">
              <AlertTriangle size={20} />
              <div>
                <strong>Dieser Plan wurde inzwischen geändert.</strong>
                <p>
                  Dein Entwurf ist noch hier. Lade den aktuellen Stand oder sichere deinen Entwurf
                  als eigenen Plan.
                </p>
                <div className={styles.bannerActions}>
                  <Button onClick={() => void reload()} disabled={pending}>
                    Aktuellen Stand laden
                  </Button>
                  <Button
                    onClick={() => {
                      setDraft({
                        data: {
                          ...cloneMaskPlan(plan),
                          title: `${plan.title} – mein Entwurf`.slice(0, 200),
                        },
                      });
                      setSelectedId("");
                      setConflict(false);
                      setError("");
                      updateLocation("");
                    }}
                    disabled={pending}
                  >
                    Als neuen Plan behalten
                  </Button>
                </div>
              </div>
            </div>
          )}
          <ErrorMessage message={error} />
          <div className={styles.toolbar}>
            {!compact && (
              <div className={styles.addActions}>
                <Button onClick={addLane} disabled={pending || plan.lanes.length >= 24}>
                  <Plus size={16} />
                  Personalspalte
                </Button>
                <Button
                  onClick={() => addBlock()}
                  disabled={pending || !plan.lanes.length || plan.blocks.length >= 250}
                >
                  <Plus size={16} />
                  Zeitblock
                </Button>
              </div>
            )}
            <div className={styles.viewControls}>
              <label>
                Beginn (optional)
                <input
                  type="time"
                  aria-label="Vorstellungsbeginn (optional)"
                  value={performanceTime}
                  onChange={(event) => setPerformanceTime(event.target.value)}
                />
              </label>
            </div>
          </div>
          <div
            inert={pending}
            className={styles.workspaceContent}
            onClickCapture={(event) => {
              const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
              if (
                link &&
                dirty &&
                event.button === 0 &&
                !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) &&
                link.getAttribute("target") !== "_blank" &&
                !guard()
              ) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            {plan.lanes.length ? (
              <Timetable key={compact ? "saved" : "editing"} {...timetableProps} />
            ) : (
              <div className={styles.empty}>
                <Empty
                  title="Wer arbeitet in der Maske?"
                  description="Lege zuerst eine Personalspalte an. Eine oder mehrere Maskenpersonen können sich eine Spalte teilen. Danach kommen die Zeitblöcke für Schauspieler und Tätigkeiten dazu."
                  action="Personalspalte hinzufügen"
                  onAction={addLane}
                />
              </div>
            )}
          </div>
          {plan.notes && (
            <details className={styles.planNotes}>
              <summary>Hinweise zum Plan</summary>
              <p>{plan.notes}</p>
            </details>
          )}
          {overlaps.length > 0 && (
            <details className={styles.warnings}>
              <summary>
                <AlertTriangle size={17} />
                {overlaps.length} {overlaps.length === 1 ? "Überschneidung" : "Überschneidungen"}{" "}
                prüfen
              </summary>
              <p>
                Das sind Hinweise. Wenn ihr parallel arbeiten könnt, darf der Plan so gespeichert
                werden.
              </p>
              <ul>
                {overlaps.slice(0, 30).map((overlap, index) => {
                  const first = plan.blocks.find((block) => block.id === overlap.firstId)!;
                  const second = plan.blocks.find((block) => block.id === overlap.secondId)!;
                  return (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => openEditor({ type: "block", creating: false, block: first })}
                      >
                        {maskPlanBlockLabel(first, workspace.records.actors)}
                      </button>
                      <span> und </span>
                      <button
                        type="button"
                        onClick={() =>
                          openEditor({ type: "block", creating: false, block: second })
                        }
                      >
                        {maskPlanBlockLabel(second, workspace.records.actors)}
                      </button>
                      <span>
                        {" "}
                        überschneiden sich{" "}
                        {overlap.reason === "lane"
                          ? "in derselben Personalspalte"
                          : overlap.reason === "actor"
                            ? "für dieselbe Schauspielperson"
                            : "bei gemeinsamem Maskenpersonal"}
                        .
                      </span>
                    </li>
                  );
                })}
              </ul>
              {overlaps.length > 30 && (
                <p>{overlaps.length - 30} weitere Überschneidungen im Plan.</p>
              )}
            </details>
          )}
          {!compact && (
            <footer className={styles.saveBar} data-dirty={dirty}>
              <span className={styles.saveStatus} role="status">
                {dirty ? (
                  <>
                    <span className={styles.dirtyDot} />
                    Ungespeicherte Änderungen
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Keine ungespeicherten Änderungen
                  </>
                )}
                {dirty && <small>Export nach dem Speichern</small>}
              </span>
              <div>
                {!dirty && (
                  <Button onClick={() => setEditing(false)} disabled={pending}>
                    Bearbeiten beenden
                  </Button>
                )}
                <Button
                  onClick={() => {
                    if (guard()) {
                      reset();
                      if (!selected) setSelectedId(plans[0]?.id || "");
                    }
                  }}
                  disabled={!dirty || pending}
                >
                  <Undo2 size={16} />
                  Verwerfen
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void savePlan()}
                  disabled={!dirty || busy || pending || conflictVisible || !online}
                >
                  <Save size={16} />
                  {pending ? "Wird gespeichert …" : "Plan speichern"}
                </Button>
              </div>
              {!online && (
                <p className={styles.offline}>
                  Ohne Verbindung bleibt der Entwurf in dieser Ansicht. Speichere, sobald du wieder
                  online bist.
                </p>
              )}
            </footer>
          )}
        </>
      ) : (
        <div className={styles.empty}>
          <Empty
            title="Ein klarer Ablauf bis zum Beginn."
            description="Plant, welche Schauspieler wann in die Maske kommen, wer sie betreut und wie lange es dauert. Alle Zeiten zählen rückwärts zum Vorstellungsbeginn."
            action="Maskenplan anlegen"
            onAction={beginNew}
          />
        </div>
      )}
      {editor?.type === "options" && (
        <PlanOptions
          plan={editor.plan}
          creating={editor.creating}
          onClose={() => setEditor(null)}
          onApply={(next) => {
            if (editor.creating) {
              setDraft({ data: next });
              setEditing(true);
              setSelectedId("");
              setConflict(false);
              setError("");
              updateLocation("");
            } else change(next, editor.base);
          }}
        />
      )}
      {plan && editor?.type === "lane" && (
        <LaneEditor
          lane={editor.lane}
          creating={editor.creating}
          blockCount={plan.blocks.filter((block) => block.laneId === editor.lane.id).length}
          onClose={() => setEditor(null)}
          onApply={(lane) =>
            change(
              {
                ...(editor.snapshot || plan),
                lanes: editor.creating
                  ? [...(editor.snapshot || plan).lanes, lane]
                  : (editor.snapshot || plan).lanes.map((item) =>
                      item.id === lane.id ? lane : item,
                    ),
              },
              editor.base,
            )
          }
          onRemove={() =>
            change(
              {
                ...(editor.snapshot || plan),
                lanes: (editor.snapshot || plan).lanes.filter((item) => item.id !== editor.lane.id),
                blocks: (editor.snapshot || plan).blocks.filter(
                  (item) => item.laneId !== editor.lane.id,
                ),
              },
              editor.base,
            )
          }
        />
      )}
      {plan && editor?.type === "block" && (
        <BlockEditor
          block={editor.block}
          plan={editor.snapshot || plan}
          castActors={castActors}
          castNames={castNames}
          performanceTime={performanceTime}
          creating={editor.creating}
          onClose={() => setEditor(null)}
          onApply={(block) =>
            change(
              {
                ...(editor.snapshot || plan),
                blocks: editor.creating
                  ? [...(editor.snapshot || plan).blocks, block]
                  : (editor.snapshot || plan).blocks.map((item) =>
                      item.id === block.id ? block : item,
                    ),
              },
              editor.base,
            )
          }
          onRemove={() =>
            change(
              {
                ...(editor.snapshot || plan),
                blocks: (editor.snapshot || plan).blocks.filter(
                  (item) => item.id !== editor.block.id,
                ),
              },
              editor.base,
            )
          }
        />
      )}
      {exporting && selected && (
        <Modal
          title="Maskenplan exportieren"
          onClose={() => setExporting(false)}
          className={styles.modal}
        >
          <p className={styles.hint}>
            Gespeicherter Plan: <strong>{value(selected.data, "title")}</strong>
            {performanceTime && <> · Beginn {performanceTime}</>}. PDF zeigt die Zeittabelle zum
            Ausdrucken.
          </p>
          <div className={styles.exportLinks}>
            {[
              ["pdf", "PDF · drucken"],
              ["xlsx", "Excel · Zeittabelle"],
              ["csv", "CSV · Zeitblöcke"],
              ["json", "JSON · vollständiger Plan"],
            ].map(([format, label]) => (
              <a
                key={format}
                className="button"
                href={`/api/export?${new URLSearchParams({ kind: "maskPlans", id: selected.id, productionId: production.id, format, ...(performanceTime ? { performanceTime } : {}) })}`}
                download
              >
                <Download size={17} />
                {label}
              </a>
            ))}
          </div>
          <footer className="dialog-footer">
            <Button onClick={() => setExporting(false)}>Schließen</Button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
