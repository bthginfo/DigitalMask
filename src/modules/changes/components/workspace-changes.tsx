"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, History, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { Button, Empty, ErrorMessage, Modal } from "@/components/ui";
import { RecordLink } from "@/components/record-link";
import { dateLabel } from "@/shared/client-api";
import { api } from "@/shared/client-api";
import type { ChangeFeed } from "../contracts";
import { changeLoadError } from "../client";
import { changeFieldLabel, readableChangeValue } from "../readable";
import styles from "./workspace-changes.module.css";

export function ChangesButton({
  productionId = "",
  recordId = "",
  compact = false,
}: {
  productionId?: string;
  recordId?: string;
  compact?: boolean;
}) {
  const { changes, openChanges } = useWorkspace();
  const unseen = changes.changes.filter(
    (item) =>
      (recordId
        ? item.recordId === recordId
        : !productionId || item.productionId === productionId || item.recordId === productionId) &&
      changes.isUnseen(item),
  ).length;
  return (
    <button
      type="button"
      className={compact ? `icon-button ${styles.changeButton}` : "button secondary"}
      onClick={() => openChanges(productionId, recordId)}
      aria-label={unseen ? `Änderungen, ${unseen} neu` : "Änderungen ansehen"}
      title="Änderungen ansehen"
    >
      <History size={compact ? 19 : 16} />
      {!compact && "Änderungen"}
      {unseen > 0 && <span className={styles.count}>{unseen > 99 ? "99+" : unseen}</span>}
    </button>
  );
}

export function WorkspaceChanges() {
  const { workspace, changes, changesScope, closeChanges } = useWorkspace();
  const { load: loadChanges, changes: feedChanges } = changes;
  const selected = changesScope?.productionId || "";
  const recordId = changesScope?.recordId || "";
  const [recordFeed, setRecordFeed] = useState<ChangeFeed | null>(null);
  const [recordError, setRecordError] = useState("");
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordAttempt, setRecordAttempt] = useState(0);
  const rows = (recordId ? recordFeed?.changes || [] : changes.changes).filter(
    (item) => !selected || item.productionId === selected || item.recordId === selected,
  );
  useEffect(() => {
    if (changesScope !== null && !recordId) void loadChanges();
  }, [changesScope, recordId, loadChanges]);
  useEffect(() => {
    if (changesScope === null || !recordId) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setRecordLoading(true);
      setRecordFeed(null);
      void api<ChangeFeed>(`/api/changes?${new URLSearchParams({ recordId })}`)
        .then((feed) => {
          if (active) {
            setRecordFeed(feed);
            setRecordError("");
          }
        })
        .catch((cause) => {
          if (active) setRecordError(changeLoadError(cause));
        })
        .finally(() => {
          if (active) setRecordLoading(false);
        });
    });
    return () => {
      active = false;
    };
  }, [changesScope, recordId, feedChanges, recordAttempt]);
  if (changesScope === null) return null;
  return (
    <Modal
      title={
        recordId
          ? "Änderungen an diesem Eintrag"
          : selected
            ? "Änderungen an dieser Produktion"
            : "Änderungen im Arbeitsraum"
      }
      onClose={closeChanges}
      wide
    >
      <div className={styles.toolbar}>
        <span className="small muted">
          {changes.seenAt
            ? "Neue Änderungen sind markiert. Der Verlauf bleibt hier sichtbar."
            : "Die letzten Änderungen im Team."}
        </span>
        <Button
          disabled={changes.loading || recordLoading || !rows.length}
          onClick={() =>
            changes.markSeen(selected || recordId ? rows.map((row) => row.id) : undefined)
          }
        >
          <Check size={15} />
          Als gesehen markieren
        </Button>
      </div>
      <ErrorMessage message={recordId ? recordError : changes.error} />
      {(changes.loading || recordLoading) && !rows.length ? (
        <p className={styles.loading} role="status">
          <LoaderCircle size={18} className="spin" /> Änderungen werden geladen …
        </p>
      ) : rows.length ? (
        <ol className={styles.feed}>
          {rows.map((change) => {
            const record = workspace.records[change.kind]?.find(
              (item) => item.id === change.recordId,
            );
            const author =
              workspace.members.find((item) => item.id === change.userId)?.name || "Teammitglied";
            const verb = {
              created: "angelegt",
              updated: "geändert",
              deleted: "gelöscht",
              undone: "rückgängig gemacht",
            }[change.operation];
            return (
              <li key={change.id} className={styles.entry}>
                <header>
                  <span className={styles.entryTitle}>{change.title || "Eintrag"}</span>
                  {changes.isUnseen(change) && <span className={styles.new}>Neu</span>}
                  {record && (
                    <RecordLink
                      record={record}
                      onNavigate={closeChanges}
                      decoration={false}
                      className={styles.open}
                    >
                      Öffnen <ArrowRight size={14} />
                    </RecordLink>
                  )}
                </header>
                <p className={styles.meta}>
                  {author} · {verb} · {dateLabel(change.createdAt, true)}
                </p>
                {!!change.fields.length && (
                  <details
                    className={styles.diff}
                    open={change.operation === "updated" || change.operation === "undone"}
                  >
                    <summary>
                      Was wurde geändert? <span>{change.fields.length}</span>
                    </summary>
                    <dl>
                      {change.fields.map((field) => (
                        <div className={styles.field} key={field.key}>
                          <dt>{changeFieldLabel(change.kind, field.key)}</dt>
                          <dd>
                            <div>
                              <span>Vorher</span>
                              <p>
                                {readableChangeValue(
                                  change.kind,
                                  field.key,
                                  field.before,
                                  workspace,
                                )}
                              </p>
                            </div>
                            <div>
                              <span>Jetzt</span>
                              <p>
                                {readableChangeValue(
                                  change.kind,
                                  field.key,
                                  field.after,
                                  workspace,
                                )}
                              </p>
                            </div>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      ) : (recordId ? recordError : changes.error) ? (
        <div className={styles.loading}>
          <Button
            onClick={() =>
              recordId ? setRecordAttempt((attempt) => attempt + 1) : void loadChanges()
            }
          >
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <Empty
          title="Noch keine Änderungen."
          description="Änderungen an Produktionen, Plänen und Einträgen erscheinen hier mit Namen und Uhrzeit."
        />
      )}
      <footer className="dialog-footer">
        <span className="small muted">Verlauf der letzten 30 Tage</span>
        <Button onClick={closeChanges}>Schließen</Button>
      </footer>
    </Modal>
  );
}

export function UndoStrip() {
  const { undoReceipts, undoOperation, dismissUndo, busy } = useWorkspace();
  const [error, setError] = useState("");
  const [host, setHost] = useState<HTMLElement | null>(null);
  const stripRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const latest = undoReceipts[0];
  useEffect(() => {
    const update = () => {
      const focused = document.activeElement?.closest<HTMLDialogElement>("dialog[open]");
      const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]"));
      const dialog = focused || dialogs[dialogs.length - 1];
      setHost(dialog?.querySelector<HTMLElement>(".dialog-heading") || dialog || document.body);
    };
    void Promise.resolve().then(update);
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    document.addEventListener("focusin", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", update);
    };
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => setError(""));
  }, [latest?.id]);
  useEffect(() => {
    if (host?.tagName === "DIALOG" && latest?.id)
      stripRef.current?.scrollIntoView({ block: "nearest" });
  }, [host, latest?.id]);
  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error, host]);
  if (!latest || !host) return null;
  const undo = async () => {
    setError("");
    try {
      await undoOperation(latest.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Das Rückgängigmachen ist nicht möglich. Bitte lade den Eintrag erneut.",
      );
    }
  };
  return createPortal(
    <aside
      ref={stripRef}
      className={`${styles.undo}${host.closest("dialog") ? ` ${styles.undoInsideDialog}` : ""}`}
      aria-label="Letzte Änderung rückgängig machen"
    >
      <div className={styles.undoText} role="status">
        <strong>{latest.label}</strong>
        <span>Für kurze Zeit rückgängig machbar</span>
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => void undo()}
      >
        <RotateCcw size={16} />
        Rückgängig
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Rückgängig-Hinweis schließen"
        onClick={() => dismissUndo(latest.id)}
      >
        <X size={16} />
      </button>
      {error && (
        <p className={styles.undoError} ref={errorRef} role="alert" tabIndex={-1}>
          {error}
        </p>
      )}
    </aside>,
    host,
  );
}
