import type { RecordData } from "@/shared/contracts";

export interface TimeDraft {
  id: string;
  data: RecordData;
  createdAt: string;
}

export function timeDraftQueueKey(kind: "attendance" | "time", userId: string) {
  return `digitalmask-${kind}-drafts:${userId}`;
}

function updateQueue(key: string, change: (drafts: TimeDraft[]) => TimeDraft[]) {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return false;
    const next = change(parsed);
    if (next === parsed) return true;
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event("digitalmask-storage"));
    return true;
  } catch {
    // Restricted/full browser storage must never prevent a server save.
    return false;
  }
}

/** The same receipt is sent to the server by manual retries and offline synchronization. */
export function retainTimeDraft(key: string, id: string, data: RecordData) {
  return updateQueue(key, (drafts) => [
    ...drafts.filter((draft) => draft.id !== id),
    {
      id,
      data: { ...data, idempotencyKey: id },
      createdAt: drafts.find((draft) => draft.id === id)?.createdAt || new Date().toISOString(),
    },
  ]);
}

export function clearTimeDraft(key: string, id: string) {
  return updateQueue(key, (drafts) =>
    drafts.some((draft) => draft.id === id) ? drafts.filter((draft) => draft.id !== id) : drafts,
  );
}
