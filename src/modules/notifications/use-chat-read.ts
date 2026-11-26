"use client";
import { useEffect, useRef, type RefObject } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { value } from "@/shared/client-api";
import { chatChoiceKey } from "@/modules/chat/channel-order";
import { isChatNotice } from "./unread";
export function useChatRead(
  conversationId: string,
  productionId: string,
  endRef?: RefObject<HTMLElement | null>,
) {
  const { workspace, action } = useWorkspace();
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  }, [action]);
  const unread = workspace.chatUnread?.[chatChoiceKey(conversationId, productionId)] || 0;
  // Rows from older releases are acknowledged together with the read cursor.
  const legacyIds = workspace.records.notifications
    .filter(
      (notice) =>
        notice.data.userId === workspace.user.id &&
        !notice.data.read &&
        isChatNotice(notice) &&
        value(notice.data, "conversationId") === conversationId &&
        (conversationId || value(notice.data, "productionId") === productionId),
    )
    .map((notice) => notice.id)
    .sort()
    .join(",");
  // The newest message this tab shows; later arrivals stay unread.
  const readAt = workspace.records.messages
    .filter(
      (message) =>
        value(message.data, "conversationId") === conversationId &&
        (conversationId || value(message.data, "productionId") === productionId),
    )
    .reduce((latest, message) => (message.createdAt > latest ? message.createdAt : latest), "");
  const pending = unread || legacyIds ? `${unread}:${readAt}:${legacyIds}` : "";
  const attempted = useRef("");
  useEffect(() => {
    if (!pending) return;
    let endVisible = !endRef;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      clearTimeout(timer);
      if (document.hidden || !endVisible || attempted.current === pending) return;
      timer = setTimeout(() => {
        if (document.hidden || !endVisible) return;
        attempted.current = pending;
        void actionRef
          .current("chat-notifications-read", undefined, {
            conversationId,
            productionId,
            ...(readAt ? { readAt } : {}),
          })
          .catch(() => undefined);
      }, 600);
    };
    read();
    const observer = endRef?.current
      ? new IntersectionObserver((entries) => {
          endVisible = entries.some((entry) => entry.isIntersecting);
          read();
        })
      : null;
    if (endRef?.current) observer?.observe(endRef.current);
    document.addEventListener("visibilitychange", read);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", read);
    };
  }, [conversationId, productionId, pending, readAt, endRef]);
}
