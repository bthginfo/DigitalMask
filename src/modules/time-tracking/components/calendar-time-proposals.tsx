"use client";
import { useMemo, useState } from "react";
import { CalendarCheck, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { dateLabel, hours } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import { categoriesFor } from "@/shared/domain-categories";
import { useStoredValue } from "@/shared/client-storage";
import type { PeriodFilter } from "@/shared/period-filter";
import {
  calendarTimeProposals,
  type CalendarTimeProposal,
  type ProposalRange,
} from "../calendar-proposals";
import { TimeBookingEditor } from "./time-booking-editor";
import styles from "./time-history.module.css";

export function CalendarTimeProposals({
  kind,
  person,
  week,
  period,
  productionId = "",
}: {
  kind: "attendance" | "time";
  person: string;
  week: string;
  period: PeriodFilter;
  productionId?: string;
}) {
  const { workspace } = useWorkspace();
  const [selected, setSelected] = useState<CalendarTimeProposal | null>(null);
  const [reviewedJson, setReviewedJson] = useStoredValue(
    `digitalmask-calendar-reviewed:${workspace.user.id}:${kind}`,
    "[]",
  );
  const reviewed = useMemo<ProposalRange[]>(() => {
    try {
      const parsed = JSON.parse(reviewedJson);
      return Array.isArray(parsed)
        ? parsed.filter(
            (range) => range && typeof range.start === "string" && typeof range.end === "string",
          )
        : [];
    } catch {
      return [];
    }
  }, [reviewedJson]);
  const result = useMemo(
    () =>
      calendarTimeProposals({
        kind,
        userId: person,
        week,
        now: new Date(),
        events: workspace.records.events,
        bookings: workspace.records[kind],
        productions: workspace.records.productions,
        calendarCategories: workspace.records.calendarCategories,
        timeCategoryKeys: categoriesFor("time", workspace.records.categories).map(
          (category) => category.key,
        ),
        productionId,
        period,
        reviewed,
      }),
    [kind, person, week, workspace.records, productionId, period, reviewed],
  );
  if (!isActiveStaff(workspace.user) || person !== workspace.user.id) return null;
  return (
    <>
      <details className={styles.proposals}>
        <summary>
          <CalendarCheck size={18} />
          <span>
            <strong>Kalenderzeiten prüfen</strong>
            <small>
              {result.proposals.length
                ? `${result.proposals.length} geplante ${result.proposals.length === 1 ? "Zeit" : "Zeiten"} · noch nicht gebucht`
                : "Geplante Zeiten · noch nicht gebucht"}
            </small>
          </span>
          <ChevronDown size={18} />
        </summary>
        <div className={styles.proposalBody}>
          <p className="small muted">
            Nur beendete eigene Dienste werden vorgeschlagen. Prüfe die tatsächlich geleistete Zeit,
            Pausen und Zuordnung. Erst „Geprüfte Zeit buchen“ zählt als{" "}
            {kind === "attendance" ? "Anwesenheit" : "Arbeitszeit"}.
          </p>
          {result.overlappingEvents && (
            <p className={styles.proposalNotice}>
              Kalendertermine überschneiden sich. Die mehrdeutigen Teile sind ausgelassen; ordne
              diese Zeiten bei Bedarf manuell zu.
            </p>
          )}
          {result.undatedBookings && (
            <p className={styles.proposalNotice}>
              An Tagen mit Buchungen ohne Uhrzeit sind Vorschläge ausgelassen. Prüfe dort die
              vorhandenen Buchungen.
            </p>
          )}
          {result.blockedDayEvents && (
            <p className={styles.proposalNotice}>
              Dienste liegen auf einem gesperrten freien oder abwesenden Tag. Diese Teile sind
              ausgelassen; prüfe zuerst den Kalender.
            </p>
          )}
          {result.proposals.length ? (
            <ul className={styles.proposalList}>
              {result.proposals.map((proposal) => (
                <li key={proposal.id}>
                  <div>
                    <span className={styles.plannedLabel}>Noch nicht gebucht</span>
                    <strong>{proposal.sourceLabels.join(" · ")}</strong>
                    <span className="small muted">
                      {dateLabel(proposal.start, true)} – {dateLabel(proposal.end, true)} ·{" "}
                      {hours(proposal.seconds)} h geplant
                    </span>
                    {proposal.adjusted && (
                      <span className="small muted">Bereits belegte Zeiten sind ausgespart.</span>
                    )}
                  </div>
                  <Button onClick={() => setSelected(proposal)}>Prüfen</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyInline}>
              Keine offenen Vorschläge in dieser Woche. Zukünftige, laufende, ganztägige und bereits
              gebuchte Zeiten werden nicht vorgeschlagen.
            </p>
          )}
        </div>
      </details>
      {selected && (
        <TimeBookingEditor
          kind={kind}
          defaults={selected.data}
          proposal={selected.sourceLabels.join(" · ")}
          onSaved={() =>
            setReviewedJson(
              JSON.stringify([...reviewed, { start: selected.start, end: selected.end }]),
            )
          }
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
