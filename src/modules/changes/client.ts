"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/shared/client-api";
import type { ChangeFeed, ChangeSummary, UndoReceipt } from "./contracts";

export const changeSignal = "digitalmask-data-changed";
export function changeLoadError(cause: unknown) {
  if (cause instanceof ApiFailure && (cause.status === 401 || cause.status === 403))
    return cause.message;
  return "Der Änderungsverlauf konnte gerade nicht geladen werden. Deine gespeicherten Einträge bleiben erhalten. Bitte versuche es erneut.";
}
const seenKey = (userId: string) => `digitalmask-changes-seen:${userId}`;
const readKey = (userId: string) => `digitalmask-changes-read:${userId}`;
const undoKey = (userId: string) => `digitalmask-undo:${userId}`;

export function validUndoReceipts(value: unknown, now = Date.now()): UndoReceipt[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is UndoReceipt =>
        !!item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.expiresAt === "string" &&
        Date.parse(item.expiresAt) > now,
    )
    .slice(0, 10);
}

export function useUndoReceipts(userId?: string) {
  const [receipts, setReceipts] = useState<UndoReceipt[]>([]);
  useEffect(() => {
    if (!userId) return;
    let restored: UndoReceipt[] = [];
    try {
      restored = validUndoReceipts(JSON.parse(localStorage.getItem(undoKey(userId)) || "[]"));
    } catch {}
    // This user can change only when the authorized workspace first arrives.
    void Promise.resolve().then(() => setReceipts(restored));
  }, [userId]);
  const store = useCallback(
    (next: UndoReceipt[]) => {
      if (!userId) return;
      try {
        localStorage.setItem(undoKey(userId), JSON.stringify(next));
      } catch {}
    },
    [userId],
  );
  const capture = useCallback(
    (result: unknown) => {
      const receipt = validUndoReceipts([
        result && typeof result === "object" && "undo" in result ? result.undo : null,
      ])[0];
      if (!receipt) return;
      setReceipts((current) => {
        const next = validUndoReceipts([
          receipt,
          ...current.filter((item) => item.id !== receipt.id),
        ]);
        store(next);
        return next;
      });
    },
    [store],
  );
  const dismiss = useCallback(
    (id: string) => {
      setReceipts((current) => {
        const next = current.filter((item) => item.id !== id);
        store(next);
        return next;
      });
    },
    [store],
  );
  useEffect(() => {
    if (!receipts.length) return;
    const expiry = Math.min(...receipts.map((item) => Date.parse(item.expiresAt)));
    const timeout = setTimeout(
      () => {
        setReceipts((current) => {
          const next = validUndoReceipts(current);
          store(next);
          return next;
        });
      },
      Math.max(0, expiry - Date.now()) + 50,
    );
    return () => clearTimeout(timeout);
  }, [receipts, store]);
  return { receipts, capture, dismiss };
}

export function useChangeFeed(userId?: string) {
  const [changes, setChanges] = useState<ChangeSummary[]>([]);
  const [seenAt, setSeenAt] = useState("");
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cursor = useRef("");
  const pending = useRef<Promise<void> | null>(null);
  const reloadQueued = useRef(false);
  const load = useCallback(() => {
    if (!userId) return Promise.resolve();
    if (pending.current) return pending.current;
    setLoading(true);
    const run = async () => {
      do {
        reloadQueued.current = false;
        try {
          const feed = await api<ChangeFeed>("/api/changes");
          setChanges(Array.isArray(feed.changes) ? feed.changes : []);
          cursor.current = typeof feed.cursor === "string" ? feed.cursor : "";
          setError("");
        } catch (cause) {
          setError(changeLoadError(cause));
        }
      } while (reloadQueued.current);
    };
    pending.current = run().finally(() => {
      setLoading(false);
      pending.current = null;
    });
    return pending.current;
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let previous = "";
    let read: string[] = [];
    try {
      previous = localStorage.getItem(seenKey(userId)) || "";
      const storedRead = JSON.parse(localStorage.getItem(readKey(userId)) || "[]");
      if (Array.isArray(storedRead))
        read = storedRead.filter((id): id is string => typeof id === "string");
      if (!previous) {
        previous = new Date().toISOString();
        localStorage.setItem(seenKey(userId), previous);
      }
    } catch {
      previous = new Date().toISOString();
    }
    void Promise.resolve().then(() => {
      setSeenAt(previous);
      setSeenIds(read);
      void load();
    });
    const refresh = () => {
      if (pending.current) reloadQueued.current = true;
      else void load();
    };
    window.addEventListener(changeSignal, refresh);
    return () => window.removeEventListener(changeSignal, refresh);
  }, [userId, load]);
  const markSeen = useCallback(
    (ids?: string[]) => {
      if (!userId) return;
      if (ids) {
        const next = [...new Set([...seenIds, ...ids])].slice(-1000);
        setSeenIds(next);
        try {
          localStorage.setItem(readKey(userId), JSON.stringify(next));
        } catch {}
        return;
      }
      if (!changes.length) return;
      const latest =
        cursor.current ||
        changes.reduce((max, change) => (change.createdAt > max ? change.createdAt : max), seenAt);
      setSeenAt(latest);
      setSeenIds([]);
      try {
        localStorage.setItem(seenKey(userId), latest);
      } catch {}
      try {
        localStorage.removeItem(readKey(userId));
      } catch {}
    },
    [userId, changes, seenAt, seenIds],
  );
  const isUnseen = useCallback(
    (change: ChangeSummary) =>
      Date.parse(change.createdAt) > Date.parse(seenAt) && !seenIds.includes(change.id),
    [seenAt, seenIds],
  );
  return {
    changes,
    seenAt,
    loading,
    error,
    load,
    markSeen,
    isUnseen,
    unseen: changes.filter(isUnseen).length,
  };
}
