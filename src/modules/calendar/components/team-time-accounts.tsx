"use client";
import { useId, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Scale } from "lucide-react";
import { dateLabel, hours } from "@/shared/client-api";
import { signedHours } from "@/modules/time-tracking/balance";
import { sortTimeAccounts, type AccountSort, type CalendarTimeAccount } from "../time-accounts";
import styles from "./team-time-accounts.module.css";

function amountClass(account: CalendarTimeAccount) {
  return (account.balanceSeconds || 0) > 0
    ? styles.positive
    : (account.balanceSeconds || 0) < 0
      ? styles.negative
      : "";
}
function accountLabel(account: CalendarTimeAccount) {
  return account.state === "future"
    ? `Ab ${dateLabel(account.availableFrom || "")}`
    : account.state === "unconfigured"
      ? "Wochenstunden fehlen"
      : `${signedHours(account.balanceSeconds || 0)} h`;
}

export function TeamTimeAccountBadge({
  account,
  onOpen,
}: {
  account?: CalendarTimeAccount;
  onOpen?: (person: string) => void;
}) {
  if (!account) return null;
  if (account.state !== "ready")
    return (
      <span className={styles.missingBadge} title={accountLabel(account)}>
        {account.state === "future" ? accountLabel(account) : "Soll fehlt"}
      </span>
    );
  return (
    <button
      type="button"
      className={`${styles.badge} ${amountClass(account)}`}
      aria-label={`Zeitkonto von ${account.member.name}: ${accountLabel(account)} · Details anzeigen`}
      title="Saldo abgeschlossener Wochen · Details anzeigen"
      onClick={() => onOpen?.(account.member.id)}
    >
      {accountLabel(account)}
    </button>
  );
}

export function TeamTimeAccounts({
  accounts,
  through,
  mobile,
  onOpen,
}: {
  accounts: CalendarTimeAccount[];
  through: string;
  mobile: boolean;
  onOpen: (person: string) => void;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [sort, setSort] = useState<AccountSort>("team");
  const open = expanded ?? !mobile;
  const sorted = useMemo(() => sortTimeAccounts(accounts, sort), [accounts, sort]);
  return (
    <section className={styles.panel} aria-label="Stundenkonten im Team">
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setExpanded(!open)}
      >
        <Scale size={17} aria-hidden="true" />
        <span className={styles.title}>Stunden im Team</span>
        <span className={styles.stand}>Saldo bis {dateLabel(through)}</span>
        {open ? (
          <ChevronDown size={17} aria-hidden="true" />
        ) : (
          <ChevronRight size={17} aria-hidden="true" />
        )}
      </button>
      <div id={contentId} hidden={!open}>
        <div className={styles.explanation}>
          <p>
            Plus / Minus aus abgeschlossenen Wochen. Die laufende Woche steht separat in den
            Details.
          </p>
          <select
            aria-label="Stundenkonten sortieren"
            value={sort}
            onChange={(event) => setSort(event.target.value as AccountSort)}
          >
            <option value="team">Teamreihenfolge</option>
            <option value="balance-asc">Saldo: niedrigste zuerst</option>
            <option value="balance-desc">Saldo: höchste zuerst</option>
          </select>
        </div>
        {sorted.length ? (
          <ul className={styles.list}>
            {sorted.map((account) => {
              const content = (
                <>
                  <span className={styles.person}>
                    <strong>{account.member.name}</strong>
                    <span>
                      {account.state === "ready"
                        ? `${hours(account.weeklySeconds || 0)} h / Woche`
                        : accountLabel(account)}
                    </span>
                  </span>
                  <span className={`${styles.amount} ${amountClass(account)}`}>
                    {account.state === "ready" ? accountLabel(account) : "—"}
                  </span>
                  {account.state === "ready" && <ChevronRight size={15} aria-hidden="true" />}
                </>
              );
              return (
                <li key={account.member.id}>
                  {account.state === "ready" ? (
                    <button
                      type="button"
                      className={styles.personButton}
                      onClick={() => onOpen(account.member.id)}
                      aria-label={`Zeitkonto von ${account.member.name}: ${accountLabel(account)} · Details anzeigen`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={styles.personButton}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.empty}>Noch keine aktiven Teammitglieder vorhanden.</p>
        )}
      </div>
    </section>
  );
}
