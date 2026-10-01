export type SyncStatus =
  "connecting" | "live" | "reconnecting" | "offline" | "paused" | "unavailable";
export interface LiveAccess {
  channel: string;
  ticket: string;
  expiresAt: number;
  cursor: string;
}

/** One visible-tab SSE connection. Reconnects replay cursors and never poll workspace data. */
export function connectLiveSync(options: {
  access: () => LiveAccess | null | undefined;
  renew: () => Promise<void>;
  changed: () => void;
  status: (status: SyncStatus) => void;
}) {
  let source: EventSource | undefined;
  let stopped = false,
    attempts = 0,
    generation = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let cursor = options.access()?.cursor || String(Date.now());
  let disconnectedAt = 0;
  const active = () =>
    document.visibilityState === "visible" && document.hasFocus() && navigator.onLine;
  const close = () => {
    generation++;
    source?.close();
    source = undefined;
    clearTimeout(retry);
    clearTimeout(watchdog);
  };
  const retryConnection = (immediate = false) => {
    close();
    if (stopped || !active()) return;
    attempts++;
    if (attempts > 12) {
      options.status("unavailable");
      return;
    }
    options.status("reconnecting");
    retry = setTimeout(
      () => void connect(),
      immediate ? 50 : Math.min(30000, 1000 * 2 ** Math.min(attempts - 1, 5)),
    );
  };
  const resetWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => retryConnection(), 75000);
  };
  const connect = async () => {
    if (stopped || !active() || source) return;
    const currentGeneration = generation;
    try {
      let access = options.access();
      if (!access || access.expiresAt <= Date.now() + 5000) {
        await options.renew();
        access = options.access();
      }
      if (stopped || generation !== currentGeneration || !active()) return;
      if (!access) {
        options.status("unavailable");
        return;
      }
      const query = new URLSearchParams({
        ticket: access.ticket,
        channel: access.channel,
        [`last_ack_${access.channel}`]: cursor,
      });
      options.status(attempts ? "reconnecting" : "connecting");
      const connection = new EventSource(`/api/realtime?${query}`);
      source = connection;
      resetWatchdog();
      connection.onmessage = (message) => {
        if (source !== connection || stopped) return;
        resetWatchdog();
        try {
          const event = JSON.parse(message.data);
          if (event.type === "connected") {
            attempts = 0;
            options.status("live");
            // Beyond retained history, a single authorized snapshot repairs a long gap.
            if (disconnectedAt && Date.now() - disconnectedAt > 55 * 60000) options.changed();
            disconnectedAt = 0;
          } else if (event.type === "reconnect") retryConnection(true);
          else if (event.type === "error") retryConnection();
          else if (
            event.event === "workspace.changed" &&
            event.channel === access.channel &&
            typeof event.id === "string" &&
            /^\d+-\d+$/.test(event.id)
          ) {
            cursor = event.id;
            options.changed();
          }
        } catch {
          /* Ignore malformed transport messages without touching workspace state. */
        }
      };
      connection.onerror = () => {
        if (source === connection) retryConnection();
      };
    } catch {
      if (generation === currentGeneration) retryConnection();
    }
  };
  const resume = () => {
    close();
    if (!navigator.onLine) options.status("offline");
    else if (!active()) {
      disconnectedAt ||= Date.now();
      options.status("paused");
    } else {
      attempts = 0;
      void connect();
    }
  };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  window.addEventListener("blur", resume);
  window.addEventListener("online", resume);
  window.addEventListener("offline", resume);
  resume();
  return () => {
    stopped = true;
    close();
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("focus", resume);
    window.removeEventListener("blur", resume);
    window.removeEventListener("online", resume);
    window.removeEventListener("offline", resume);
  };
}
