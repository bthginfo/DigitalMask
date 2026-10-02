import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import type { DocumentSession, DocumentState } from "../contracts";

const REMOTE = Symbol("document-remote");
const MAX_UPDATE = 256_000;
export const SHEET_EDIT = Symbol("sheet-edit");
export const NOTE_EDIT = Symbol("note-edit");
export type DocumentSyncStatus = "loading" | "saved" | "saving" | "offline" | "error" | "forbidden";
export interface DocumentSnapshot {
  session: DocumentSession | null;
  status: DocumentSyncStatus;
  connected: boolean;
  pending: boolean;
  localReady: boolean;
  error: string;
}
class DocumentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
function fromBase64(encoded: string) {
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}
function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}

/** One Y.Doc per file. Remote state is merged, never substituted for local edits. */
export class SharedDocument {
  readonly doc = new Y.Doc();
  private snapshot: DocumentSnapshot = {
    session: null,
    status: "loading",
    connected: false,
    pending: false,
    localReady: false,
    error: "",
  };
  private listeners = new Set<() => void>();
  private pending: Uint8Array[] = [];
  private persistence?: IndexeddbPersistence;
  private source?: EventSource;
  private stopped = false;
  private started = false;
  private revision = 0;
  private cursor = String(Date.now());
  private sendTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private checkpointTimer?: ReturnType<typeof setTimeout>;
  private dirty = false;
  private lastCheckpoint = Date.now();
  private latestEdit = 0;
  private attempts = 0;
  private sendAttempts = 0;
  private sending?: Promise<void>;
  private reading?: Promise<void>;
  private requestedRevision = 0;
  private renewing?: Promise<void>;

  constructor(
    readonly fileId: string,
    private readonly userId: string,
  ) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private change(patch: Partial<DocumentSnapshot>) {
    if (this.stopped) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private async request<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`/api/documents/${this.fileId}/${action}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal:
        typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(action === "session" ? 45000 : 20000)
          : undefined,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new DocumentRequestError(
        body.error || "Das Dokument konnte nicht gespeichert werden.",
        response.status,
        body.code,
      );
    return body as T;
  }
  private async authorized<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
    if (!this.snapshot.session || this.snapshot.session.access.expiresAt <= Date.now() + 5000)
      await this.renew();
    try {
      return await this.request<T>(action, {
        ...data,
        ticket: this.snapshot.session?.access.ticket,
      });
    } catch (error) {
      if (
        error instanceof DocumentRequestError &&
        error.status === 409 &&
        error.code === "document_session_expired"
      ) {
        await this.renew();
        return this.request<T>(action, { ...data, ticket: this.snapshot.session?.access.ticket });
      }
      throw error;
    }
  }
  private apply(state: DocumentState) {
    if (this.stopped) return;
    Y.applyUpdate(this.doc, fromBase64(state.state), REMOTE);
    // Advance only after applying the delta: an own ack can contain concurrent peer edits.
    this.revision = Math.max(this.revision, state.revision);
  }
  private renew() {
    if (this.renewing) return this.renewing;
    this.renewing = this.request<DocumentSession>("session")
      .then((session) => {
        this.apply(session);
        this.cursor = session.access.cursor;
        this.change({ session, error: "" });
      })
      .finally(() => {
        this.renewing = undefined;
      });
    return this.renewing;
  }
  async start() {
    try {
      // Do not access a local cache before server-side authorization succeeded.
      await this.renew();
      if (this.stopped) return;
      this.doc.on("update", this.onUpdate);
      try {
        if (!this.snapshot.session?.canEdit) throw new Error("read-only");
        this.persistence = new IndexeddbPersistence(
          `digitalmask-document:${this.userId}:${this.fileId}`,
          this.doc,
        );
        await Promise.race([
          this.persistence.whenSynced,
          new Promise((_, reject) => setTimeout(() => reject(new Error("storage")), 5000)),
        ]);
        this.change({ localReady: true });
      } catch {
        // Safari private mode can disable IndexedDB; online editing remains available.
        this.change({ localReady: false });
      }
      if (this.stopped) return;
      this.started = true;
      this.change({
        status: this.pending.length ? "saving" : "saved",
        pending: !!this.pending.length,
      });
      if (this.pending.length) this.scheduleSend();
      document.addEventListener("visibilitychange", this.resume);
      window.addEventListener("focus", this.resume);
      window.addEventListener("blur", this.resume);
      window.addEventListener("online", this.resume);
      window.addEventListener("offline", this.resume);
      window.addEventListener("pagehide", this.onPageHide);
      window.addEventListener("beforeunload", this.onBeforeUnload);
      this.resume();
    } catch (error) {
      this.fail(error);
    }
  }
  private onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE || this.stopped) return;
    this.pending.push(update);
    this.latestEdit = Date.now();
    this.dirty = true;
    this.change({ pending: true, status: navigator.onLine ? "saving" : "offline" });
    if (this.started) {
      this.scheduleSend();
      this.scheduleCheckpoint();
    }
  };
  private scheduleSend() {
    if (this.sendTimer || this.sending || !navigator.onLine || this.stopped) return;
    this.sendTimer = setTimeout(() => {
      this.sendTimer = undefined;
      void this.flush(false).catch(() => {});
    }, 3000);
  }
  private takeBatch() {
    let count = 0;
    let merged: Uint8Array = new Uint8Array();
    for (const update of this.pending) {
      const next = Y.mergeUpdates([...this.pending.slice(0, count), update]);
      if (next.byteLength > MAX_UPDATE) break;
      merged = next;
      count++;
    }
    if (!count)
      throw new Error(
        "Diese Änderung ist zu groß. Füge große Texte bitte in kleineren Abschnitten ein.",
      );
    this.pending.splice(0, count);
    return merged;
  }
  async flush(all = true): Promise<void> {
    clearTimeout(this.sendTimer);
    this.sendTimer = undefined;
    if (this.sending) {
      await this.sending;
      if (this.pending.length && all) return this.flush();
      return;
    }
    if (!this.pending.length) return;
    if (!navigator.onLine) {
      this.change({ status: "offline", pending: true });
      throw new Error("Du bist offline. Die Änderungen wurden noch nicht übertragen.");
    }
    if (this.snapshot.session?.canEdit === false)
      throw new Error("Du hast für dieses Dokument nur Leserechte.");
    this.change({ status: "saving", error: "" });
    this.sending = (async () => {
      let checkpointRetries = 0;
      while (this.pending.length && !this.stopped) {
        const update = this.takeBatch();
        try {
          const state = await this.authorized<DocumentState>("updates", {
            update: toBase64(update),
            sinceRevision: this.revision,
          });
          this.apply(state);
          this.sendAttempts = 0;
          if (!all) break;
        } catch (error) {
          if (
            error instanceof DocumentRequestError &&
            error.status === 409 &&
            error.code === "document_checkpoint_required" &&
            checkpointRetries++ < 1
          ) {
            this.pending.unshift(update);
            await this.authorized("checkpoint");
            continue;
          }
          this.pending.unshift(update);
          throw error;
        }
      }
      this.change({
        status: this.pending.length ? "saving" : "saved",
        pending: !!this.pending.length,
        error: "",
      });
    })()
      .catch((error) => {
        this.fail(error);
        if (this.snapshot.status !== "forbidden" && navigator.onLine && ++this.sendAttempts <= 8) {
          clearTimeout(this.sendTimer);
          this.sendTimer = setTimeout(
            () => {
              this.sendTimer = undefined;
              void this.flush(false).catch(() => {});
            },
            Math.min(30000, 3000 * 2 ** Math.min(this.sendAttempts - 1, 4)),
          );
        }
        throw error;
      })
      .finally(() => {
        this.sending = undefined;
        if (this.pending.length && this.snapshot.status === "saving") this.scheduleSend();
      });
    return this.sending;
  }
  private scheduleCheckpoint() {
    clearTimeout(this.checkpointTimer);
    // Continuous editing must not push an already-due durable checkpoint forward.
    const delay = Math.max(0, Math.min(60000, this.lastCheckpoint + 15 * 60000 - Date.now()));
    this.checkpointTimer = setTimeout(() => {
      if (this.dirty && navigator.onLine) void this.checkpoint().catch(() => {});
    }, delay);
  }
  async checkpoint() {
    await this.flush();
    if (!this.dirty || this.stopped) return;
    const edit = this.latestEdit;
    await this.authorized("checkpoint");
    this.lastCheckpoint = Date.now();
    this.dirty = this.latestEdit > edit;
    if (this.dirty) this.scheduleCheckpoint();
  }
  private readCurrent(minimumRevision = 0): Promise<void> {
    this.requestedRevision = Math.max(this.requestedRevision, minimumRevision);
    if (this.reading) return this.reading;
    this.reading = this.authorized<DocumentState>("state", { sinceRevision: this.revision })
      .then((state) => this.apply(state))
      .catch((error) => this.fail(error))
      .finally(() => {
        this.reading = undefined;
        if (this.requestedRevision > this.revision && this.snapshot.status !== "forbidden") {
          this.requestedRevision = 0;
          void this.readCurrent();
        }
      });
    return this.reading;
  }
  private fail(error: unknown) {
    const forbidden =
      error instanceof DocumentRequestError && [401, 403, 404].includes(error.status);
    this.change({
      status: forbidden ? "forbidden" : navigator.onLine ? "error" : "offline",
      pending: !!this.pending.length,
      error: forbidden
        ? "Du hast keinen Zugriff mehr auf dieses Dokument. Deine noch nicht übertragenen Änderungen bleiben auf diesem Gerät."
        : error instanceof Error
          ? error.message
          : "Die Verbindung konnte nicht hergestellt werden.",
    });
    if (forbidden) this.disconnect();
  }
  private active() {
    return document.visibilityState === "visible" && document.hasFocus() && navigator.onLine;
  }
  private disconnect() {
    this.source?.close();
    this.source = undefined;
    clearTimeout(this.retryTimer);
    clearTimeout(this.watchdog);
    this.change({ connected: false });
  }
  private retryConnection = () => {
    this.disconnect();
    if (this.stopped || !this.active() || this.snapshot.status === "forbidden") return;
    if (++this.attempts > 12) {
      this.change({ error: "Die Live-Verbindung ist unterbrochen. Verbindung erneut versuchen." });
      return;
    }
    this.retryTimer = setTimeout(
      () => void this.connect(),
      Math.min(30000, 1000 * 2 ** Math.min(this.attempts - 1, 5)),
    );
  };
  private resetWatchdog() {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(this.retryConnection, 75000);
  }
  private async connect() {
    if (this.stopped || this.source || !this.active() || this.snapshot.status === "forbidden")
      return;
    try {
      if (!this.snapshot.session || this.snapshot.session.access.expiresAt <= Date.now() + 5000)
        await this.renew();
      if (this.stopped || !this.active()) return;
      const access = this.snapshot.session!.access;
      const params = new URLSearchParams({
        channel: access.channel,
        ticket: access.ticket,
        [`last_ack_${access.channel}`]: this.cursor,
      });
      const source = new EventSource(`/api/documents/live?${params}`);
      this.source = source;
      this.resetWatchdog();
      source.onmessage = (message) => {
        if (this.source !== source || this.stopped) return;
        this.resetWatchdog();
        try {
          const event = JSON.parse(message.data);
          if (event.type === "connected") {
            this.attempts = 0;
            this.change({ connected: true, error: "" });
            void this.readCurrent();
          } else if (event.type === "reconnect" || event.type === "error") this.retryConnection();
          else if (event.event === "document.changed" && event.channel === access.channel) {
            if (typeof event.id === "string" && /^\d+-\d+$/.test(event.id)) this.cursor = event.id;
            if (typeof event.data?.revision === "number" && event.data.revision > this.revision)
              void this.readCurrent(event.data.revision);
          }
        } catch {
          /* Transport messages never replace the document. */
        }
      };
      source.onerror = () => {
        if (this.source === source) this.retryConnection();
      };
    } catch (error) {
      this.fail(error);
      this.retryConnection();
    }
  }
  private resume = () => {
    this.disconnect();
    if (this.stopped || this.snapshot.status === "forbidden") return;
    if (!navigator.onLine) this.change({ status: "offline" });
    else if (this.active()) {
      this.attempts = 0;
      this.sendAttempts = 0;
      if (this.pending.length || this.sending) {
        this.change({ status: "saving" });
        if (this.pending.length) this.scheduleSend();
      } else this.change({ status: "saved", error: "" });
      if (this.dirty) this.scheduleCheckpoint();
      void this.connect();
    } else this.flushOnExit();
  };
  private onPageHide = () => this.flushOnExit();
  private onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.snapshot.pending && !this.snapshot.localReady) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  private flushOnExit() {
    if (!this.pending.length || !this.snapshot.session?.canEdit || !navigator.onLine) return;
    const update = Y.mergeUpdates(this.pending);
    const body = JSON.stringify({
      ticket: this.snapshot.session.access.ticket,
      update: toBase64(update),
      sinceRevision: this.revision,
    });
    if (new Blob([body]).size > 60000) return;
    // Accepted Redis updates remain durable even when the browser closes before an SQL checkpoint.
    void fetch(`/api/documents/${this.fileId}/updates`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  }
  async retry() {
    if (!this.started) {
      await this.start();
      return;
    }
    this.change({ error: "" });
    this.resume();
    await this.flush();
    await this.readCurrent();
  }
  async renewSession() {
    try {
      await this.renew();
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }
  destroy() {
    this.flushOnExit();
    this.stopped = true;
    this.disconnect();
    clearTimeout(this.sendTimer);
    clearTimeout(this.checkpointTimer);
    document.removeEventListener("visibilitychange", this.resume);
    window.removeEventListener("focus", this.resume);
    window.removeEventListener("blur", this.resume);
    window.removeEventListener("online", this.resume);
    window.removeEventListener("offline", this.resume);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.doc.off("update", this.onUpdate);
    void this.persistence?.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }
}
