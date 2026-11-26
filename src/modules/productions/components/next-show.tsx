"use client";
import { useMemo, useState } from "react";
import { Clapperboard } from "lucide-react";
import type { DomainRecord, Workspace } from "@/shared/contracts";
import { ids, value } from "@/shared/client-api";
import { calendarProductionRecords } from "@/shared/calendar-access";
import { backstageChangesSection } from "@/shared/document-sections";
import { navigateWorkspace } from "@/shared/client-navigation";
import { expandEvents } from "@/modules/calendar/expand";
import { isShowEvent } from "@/modules/calendar/show-events";
import { eventMaskPlan, maskPlanEventQuery } from "@/modules/mask-plans/evening";
import styles from "./next-show.module.css";

const when = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/** The production's next performance or rehearsal with the evening's shortcuts. */
export function NextShow({
  production,
  workspace,
}: {
  production: DomainRecord;
  workspace: Workspace;
}) {
  const [now] = useState(Date.now);
  const next = useMemo(() => {
    const events = workspace.records.events.filter(
      (event) =>
        event.data.productionId === production.id &&
        isShowEvent(event, workspace.records.calendarCategories),
    );
    return expandEvents(
      events,
      new Date(now - 4 * 3600000).toISOString(),
      new Date(now + 120 * 86400000).toISOString(),
      calendarProductionRecords(workspace),
      workspace.records.calendarCategories,
    )
      .filter((event) => new Date(event.end).getTime() >= now)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
  }, [workspace, production.id, now]);
  if (!next) return null;
  const record = next.extendedProps.record;
  const crew = ids(record.data, "participantIds")
    .map((id) => workspace.members.find((member) => member.id === id)?.name)
    .filter(Boolean);
  const mine = ids(record.data, "participantIds").includes(workspace.user.id);
  const plan = eventMaskPlan(record, workspace.records.maskPlans);
  const links = [
    {
      label: plan ? `Maskenplan · ${value(plan.data, "title")}` : "Maskenplan",
      href: `/?${maskPlanEventQuery({
        productionId: production.id,
        planId: plan?.id,
        eventId: record.id,
        showStart: next.allDay ? "" : new Date(next.start).toISOString(),
      })}`,
    },
    {
      label: "Umzüge",
      href: `/?module=productions&productionId=${encodeURIComponent(production.id)}&tab=${backstageChangesSection.key}`,
    },
    {
      label: "Chat",
      href: `/?module=chat&productionId=${encodeURIComponent(production.id)}`,
    },
  ];
  return (
    <section className={styles.card} aria-label="Nächste Vorstellung">
      <span className={styles.icon} aria-hidden="true">
        <Clapperboard size={22} />
      </span>
      <div className={styles.body}>
        <span className={styles.eyebrow}>
          Als Nächstes · {next.categoryName}
          {mine && <span className={styles.mine}>Du bist eingeteilt</span>}
        </span>
        <strong className={styles.when}>{when.format(new Date(next.start))}</strong>
        <span className={styles.crew}>
          {value(record.data, "location") && `${value(record.data, "location")} · `}
          {crew.length ? crew.join(", ") : "Noch niemand aus der Maske eingeteilt"}
        </span>
        <nav className={styles.links} aria-label="Für diesen Abend">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                navigateWorkspace(link.href, {
                  returnLabel: `Zurück zu ${value(production.data, "title")}`,
                });
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
