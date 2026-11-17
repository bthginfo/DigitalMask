"use client";

import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { textValue, type DomainRecord } from "@/shared/contracts";
import { notificationHref } from "../links";

export function NotificationRow({
  notice,
  navigate,
  onOpen,
}: {
  notice: DomainRecord;
  navigate: (href: string) => void;
  onOpen?: () => void;
}) {
  const { action, notify, online } = useWorkspace();
  const href = notificationHref(notice.data);
  const read = notice.data.read === true;
  const markRead = () => {
    if (read || !online) return;
    void action("notifications-read", undefined, { ids: [notice.id] }).catch(() =>
      notify("Die Mitteilung konnte nicht als gelesen markiert werden."),
    );
  };
  const content = (
    <>
      <span className={read ? "notice-dot read" : "notice-dot"} aria-hidden="true" />
      <div>
        <strong>{textValue(notice.data.title)}</strong>
        {read && (
          <>
            {" "}
            <Badge>Gelesen</Badge>
          </>
        )}
        {!!notice.data.body && <p className="small muted">{textValue(notice.data.body)}</p>}
      </div>
    </>
  );
  return href ? (
    <a
      href={href}
      className="notification-row"
      onClick={(event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        onOpen?.();
        navigate(href);
        markRead();
      }}
    >
      {content}
      <ChevronRight size={16} className="notice-arrow" aria-hidden="true" />
    </a>
  ) : (
    <button type="button" className="notification-row" onClick={markRead}>
      {content}
    </button>
  );
}
