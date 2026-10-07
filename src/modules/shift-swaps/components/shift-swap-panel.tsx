"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRightLeft, Check, ChevronDown, Plus, X } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { listValue, textValue } from "@/shared/contracts";
import { dateLabel } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { subscribeLocation } from "@/shared/client-storage";
import { calendarPresentation } from "@/shared/calendar-categories";
import { occurrences } from "@/modules/calendar/occurrences";
import { useWorkspace } from "@/components/workspace-context";
import { Badge, Button, ErrorMessage, ExportButton, Modal } from "@/components/ui";
import { ExportDialog } from "@/components/export-dialog";
import { eligibleSwapService, shiftSwapStatusLabels } from "../model";
import type { ShiftSwapAction, ShiftSwapStatus } from "../schema";
import styles from "@/modules/workflows/components/workflow.module.css";

interface ServiceOption {
  key: string;
  event: DomainRecord;
  start: string;
  end: string;
  title: string;
}
function upcomingServices(
  events: DomainRecord[],
  memberId: string,
  categories: DomainRecord[],
  productions: DomainRecord[],
  now: number,
): ServiceOption[] {
  const until = new Date(now);
  until.setUTCFullYear(until.getUTCFullYear() + 1);
  return events
    .filter(
      (row) =>
        eligibleSwapService(row, categories) &&
        listValue(row.data.participantIds).includes(memberId),
    )
    .flatMap((event) =>
      occurrences(event, new Date(now), until)
        .filter((occurrence) => occurrence.start.getTime() > now)
        .map((occurrence) => ({
          key: `${event.id}@${occurrence.start.toISOString()}`,
          event,
          start: occurrence.start.toISOString(),
          end: occurrence.end.toISOString(),
          title: calendarPresentation(event, productions, categories).title,
        })),
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.key.localeCompare(b.key))
    .slice(0, 200);
}
const serviceLabel = (service: ServiceOption) =>
  `${dateLabel(service.start, true)} · ${service.title}`;

export function ShiftSwapPanel() {
  const { workspace, runWorkflow, busy } = useWorkspace();
  const query = useSyncExternalStore(
    subscribeLocation,
    () => location.search,
    () => "",
  );
  const focusedId = new URLSearchParams(query).get("swapId") || "";
  const [creating, setCreating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const admin = workspace.user.role !== "user";
  const requests = [...(workspace.records.shiftSwaps || [])].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id),
  );
  const active = requests.filter((row) =>
    ["awaiting_partner", "awaiting_admin"].includes(textValue(row.data.status)),
  );
  const visible = showAll
    ? requests
    : requests.filter((row) => active.includes(row) || row.id === focusedId);
  const name = (id: unknown) =>
    workspace.members.find((member) => member.id === id)?.name || "Ehemaliges Teammitglied";
  const act = async (record: DomainRecord, action: ShiftSwapAction) => {
    setError("");
    if (
      ["decline", "reject", "withdraw"].includes(action) &&
      !confirm(
        action === "withdraw"
          ? "Diese Tauschanfrage zurückziehen?"
          : "Diese Tauschanfrage ablehnen?",
      )
    )
      return;
    try {
      await runWorkflow(`/api/shift-swaps/${record.id}`, { action, version: record.version });
    } catch (exception) {
      setError(
        exception instanceof Error
          ? exception.message
          : "Die Anfrage konnte nicht bearbeitet werden.",
      );
    }
  };
  return (
    <details className={styles.disclosure} open={focusedId ? true : undefined}>
      <summary className={styles.summary}>
        <ArrowRightLeft size={17} />
        <span>Diensttausch</span>
        {active.length > 0 && <Badge>{active.length} offen</Badge>}
        <ChevronDown size={16} />
      </summary>
      <div className={styles.body}>
        <div className={styles.filters}>
          <label className="small">
            Anfragen{" "}
            <select
              value={showAll ? "all" : "open"}
              onChange={(event) => setShowAll(event.target.value === "all")}
            >
              <option value="open">Offene Anfragen</option>
              <option value="all">Alle Anfragen</option>
            </select>
          </label>
          <div className={styles.actions}>
            {requests.length > 0 && <ExportButton onClick={() => setExporting(true)} />}
            {workspace.user.role !== "superadmin" && (
              <Button onClick={() => setCreating(true)}>
                <Plus size={15} />
                Tausch anfragen
              </Button>
            )}
          </div>
        </div>
        {!visible.length && (
          <p className={styles.empty}>
            Keine offenen Anfragen. Wähle einen zukünftigen Dienst, frage eine Kollegin an und warte
            anschließend auf die Adminfreigabe.
          </p>
        )}
        <div className={styles.list}>
          {visible.map((record) => {
            const status = textValue(record.data.status) as ShiftSwapStatus;
            const partner = record.data.partnerId === workspace.user.id;
            const requester = record.data.requesterId === workspace.user.id;
            return (
              <article
                className={`${styles.row} ${record.id === focusedId ? styles.focused : ""}`}
                key={record.id}
              >
                <div className={styles.rowHeading}>
                  <div>
                    <h4>
                      {name(record.data.requesterId)} → {name(record.data.partnerId)}
                    </h4>
                    <span className={styles.note}>{dateLabel(record.createdAt, true)}</span>
                  </div>
                  <Badge
                    tone={
                      status === "approved"
                        ? "success"
                        : ["declined", "rejected", "withdrawn"].includes(status)
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {shiftSwapStatusLabels[status] || status}
                  </Badge>
                </div>
                <div className={styles.swapTimes}>
                  <div>
                    <strong>
                      {name(record.data.partnerId)} übernimmt: {textValue(record.data.serviceTitle)}
                    </strong>
                    <time>
                      {dateLabel(textValue(record.data.serviceStart), true)} –{" "}
                      {dateLabel(textValue(record.data.serviceEnd), true)}
                    </time>
                  </div>
                  {!!record.data.counterServiceId && (
                    <div>
                      <strong>
                        {name(record.data.requesterId)} übernimmt:{" "}
                        {textValue(record.data.counterServiceTitle)}
                      </strong>
                      <time>
                        {dateLabel(textValue(record.data.counterServiceStart), true)} –{" "}
                        {dateLabel(textValue(record.data.counterServiceEnd), true)}
                      </time>
                    </div>
                  )}
                </div>
                {!!record.data.note && <p className={styles.note}>{String(record.data.note)}</p>}
                {status === "awaiting_partner" && (
                  <p className={styles.note}>
                    Der Kalender bleibt unverändert, bis die Kollegin zugestimmt und ein Admin den
                    Tausch freigegeben hat.
                  </p>
                )}
                {status === "awaiting_admin" && (
                  <p className={styles.note}>
                    Die Kollegin hat zugestimmt. Jetzt fehlt noch die Adminfreigabe.
                  </p>
                )}
                {status === "approved" && (
                  <p className={styles.note}>
                    Der Tausch wurde im Kalender eingetragen. Bei Serien wurde nur dieser einzelne
                    Termin geändert.
                  </p>
                )}
                <div className={styles.actions}>
                  {partner && status === "awaiting_partner" && (
                    <>
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => void act(record, "accept")}
                      >
                        <Check size={14} />
                        Zustimmen
                      </Button>
                      <Button disabled={busy} onClick={() => void act(record, "decline")}>
                        <X size={14} />
                        Ablehnen
                      </Button>
                    </>
                  )}
                  {admin && status === "awaiting_admin" && (
                    <>
                      <Button
                        variant="primary"
                        disabled={busy}
                        onClick={() => void act(record, "approve")}
                      >
                        <Check size={14} />
                        Tausch freigeben
                      </Button>
                      <Button disabled={busy} onClick={() => void act(record, "reject")}>
                        <X size={14} />
                        Nicht freigeben
                      </Button>
                    </>
                  )}
                  {requester && ["awaiting_partner", "awaiting_admin"].includes(status) && (
                    <Button disabled={busy} onClick={() => void act(record, "withdraw")}>
                      Zurückziehen
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <ErrorMessage message={error} />
      </div>
      {creating && <ShiftSwapEditor onClose={() => setCreating(false)} />}
      {exporting && <ExportDialog kind="shiftSwaps" onClose={() => setExporting(false)} />}
    </details>
  );
}

export function ShiftSwapEditor({ onClose }: { onClose: () => void }) {
  const { workspace, runWorkflow, busy } = useWorkspace();
  const [now] = useState(Date.now);
  const [serviceKey, setServiceKey] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [counterKey, setCounterKey] = useState("");
  const [reciprocal, setReciprocal] = useState(false);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const events = workspace.records.events,
    categories = workspace.records.calendarCategories,
    productions = workspace.records.productions;
  const mine = useMemo(
    () => upcomingServices(events, workspace.user.id, categories, productions, now),
    [events, workspace.user.id, categories, productions, now],
  );
  const theirs = useMemo(
    () =>
      partnerId
        ? upcomingServices(events, partnerId, categories, productions, now).filter(
            (option) => !listValue(option.event.data.participantIds).includes(workspace.user.id),
          )
        : [],
    [events, partnerId, workspace.user.id, categories, productions, now],
  );
  const selected = mine.find((option) => option.key === serviceKey);
  const counter = theirs.find((option) => option.key === counterKey);
  const partners = workspace.members.filter(
    (member) =>
      isActiveStaff(member) &&
      member.id !== workspace.user.id &&
      (!selected || !listValue(selected.event.data.participantIds).includes(member.id)),
  );
  const selectedPartner = partners.find((member) => member.id === partnerId);
  return (
    <Modal title="Diensttausch anfragen" onClose={busy ? () => {} : onClose}>
      <form
        className={styles.form}
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          if (!selected || !selectedPartner || (reciprocal && !counter) || !confirmed) {
            setError("Bitte wähle Dienst und Kollegin und bestätige deine Anfrage.");
            return;
          }
          try {
            await runWorkflow("/api/shift-swaps", {
              serviceId: selected.event.id,
              serviceStart: selected.start,
              serviceVersion: selected.event.version,
              partnerId,
              note,
              confirmed,
              ...(reciprocal && counter
                ? {
                    counterServiceId: counter.event.id,
                    counterServiceStart: counter.start,
                    counterServiceVersion: counter.event.version,
                  }
                : {}),
            });
            onClose();
          } catch (exception) {
            setError(
              exception instanceof Error
                ? exception.message
                : "Die Anfrage konnte nicht gespeichert werden.",
            );
          }
        }}
      >
        <p className={styles.note}>
          Zuerst stimmt die Kollegin zu. Danach prüft ein Admin den Tausch und ändert den Kalender.
        </p>
        {!mine.length && (
          <p className={styles.empty}>
            Du hast aktuell keinen zukünftigen Dienst zum Tauschen. Ganztägige Abwesenheiten und
            Freiwünsche können nicht getauscht werden.
          </p>
        )}
        <div className="form-grid">
          <label className="field-wide">
            Mein Dienst
            <select
              required
              value={serviceKey}
              onChange={(event) => {
                setServiceKey(event.target.value);
                setPartnerId("");
                setCounterKey("");
                setConfirmed(false);
              }}
            >
              <option value="">Dienst auswählen …</option>
              {mine.map((option) => (
                <option key={option.key} value={option.key}>
                  {serviceLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-wide">
            Wer soll übernehmen?
            <select
              required
              value={partnerId}
              disabled={!selected}
              onChange={(event) => {
                setPartnerId(event.target.value);
                setCounterKey("");
                setConfirmed(false);
              }}
            >
              <option value="">Kollegin auswählen …</option>
              {partners.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Art der Anfrage</legend>
          <label className={styles.confirmation}>
            <input
              type="checkbox"
              checked={reciprocal}
              onChange={(event) => {
                setReciprocal(event.target.checked);
                setCounterKey("");
                setConfirmed(false);
              }}
            />
            Ich übernehme dafür einen Dienst der Kollegin.
          </label>
          {reciprocal && (
            <label>
              Gegendienst
              <select
                required
                value={counterKey}
                disabled={!partnerId}
                onChange={(event) => {
                  setCounterKey(event.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">Gegendienst auswählen …</option>
                {theirs
                  .filter((option) => option.event.id !== selected?.event.id)
                  .map((option) => (
                    <option key={option.key} value={option.key}>
                      {serviceLabel(option)}
                    </option>
                  ))}
              </select>
              {partnerId && !theirs.length && (
                <span className={styles.note}>
                  Keine passenden zukünftigen Dienste in deinen sichtbaren Kalendern.
                </span>
              )}
            </label>
          )}
        </fieldset>
        {selected && (
          <div className={styles.swapTimes}>
            <div>
              <strong>
                {selectedPartner?.name || "Kollegin"} übernimmt: {selected.title}
              </strong>
              <time>
                {dateLabel(selected.start, true)} – {dateLabel(selected.end, true)}
              </time>
            </div>
            {reciprocal && counter && (
              <div>
                <strong>Ich übernehme: {counter.title}</strong>
                <time>
                  {dateLabel(counter.start, true)} – {dateLabel(counter.end, true)}
                </time>
              </div>
            )}
          </div>
        )}
        <label>
          Nachricht · optional
          <textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Was soll deine Kollegin wissen?"
          />
        </label>
        <label className={styles.confirmation}>
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Ich möchte diesen Dienst abgeben
          {reciprocal ? " und den ausgewählten Gegendienst übernehmen" : ""}.
        </label>
        {!!selected?.event.data.recurrence && selected.event.data.recurrence !== "none" && (
          <p className={styles.note}>
            Dies ist ein Serientermin. Deine Anfrage betrifft nur den ausgewählten Tag.
          </p>
        )}
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy || !selected || !selectedPartner || !confirmed || (reciprocal && !counter)
            }
          >
            {busy ? "Wird gesendet …" : "Anfrage senden"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
