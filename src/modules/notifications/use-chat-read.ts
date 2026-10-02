"use client";
import { useEffect, useRef, type RefObject } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { value } from "@/shared/client-api";
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
  const unreadIds = workspace.records.notifications
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
  const attempted = useRef("");
  useEffect(() => {
    if (!unreadIds) return;
    let endVisible = !endRef;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      clearTimeout(timer);
      if (document.hidden || !endVisible || attempted.current === unreadIds) return;
      timer = setTimeout(() => {
        if (document.hidden || !endVisible) return;
        attempted.current = unreadIds;
        void actionRef
          .current("chat-notifications-read", undefined, { conversationId, productionId })
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
  }, [conversationId, productionId, unreadIds, endRef]);
}
