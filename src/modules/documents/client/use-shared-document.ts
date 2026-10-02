"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { SharedDocument, type DocumentSnapshot } from "./shared-document";

const loading: DocumentSnapshot = {
  session: null,
  status: "loading",
  connected: false,
  pending: false,
  localReady: false,
  error: "",
};
export function useSharedDocument(fileId: string, userId: string) {
  const [opened, setOpened] = useState<{
    client: SharedDocument;
    fileId: string;
    userId: string;
  } | null>(null);
  const client = opened?.fileId === fileId && opened?.userId === userId ? opened.client : null;
  useEffect(() => {
    const next = new SharedDocument(fileId, userId);
    let cancelled = false;
    void next.start().then(() => {
      if (!cancelled) setOpened({ client: next, fileId, userId });
    });
    return () => {
      cancelled = true;
      next.destroy();
    };
  }, [fileId, userId]);
  const snapshot = useSyncExternalStore(
    client?.subscribe || (() => () => {}),
    client?.getSnapshot || (() => loading),
    () => loading,
  );
  return { client, ...snapshot };
}
