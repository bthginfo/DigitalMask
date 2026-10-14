"use client";

import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { useWorkspace } from "@/components/workspace-context";
import { unreadNotifications } from "../unread";
import styles from "./mark-all-read.module.css";

export function MarkAllReadButton() {
  const { workspace, action, busy, online, notify } = useWorkspace();
  const [pending, setPending] = useState(false);
  const unread = unreadNotifications(workspace.records.notifications, workspace.user.id);
  if (!unread.length) return null;

  const markAll = async () => {
    if (busy || pending || !online) return;
    setPending(true);
    try {
      await action("notifications-read", undefined, { ids: unread.map((item) => item.id) });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Mitteilungen konnten nicht gelesen werden.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        className="button ghost"
        disabled={busy || pending || !online}
        aria-busy={pending}
        title={!online ? "Zum Markieren bitte mit dem Internet verbinden." : undefined}
        onClick={() => void markAll()}
      >
        <CheckCheck size={16} aria-hidden="true" />
        {pending ? "Wird als gelesen markiert …" : "Alle als gelesen markieren"}
      </button>
    </div>
  );
}
