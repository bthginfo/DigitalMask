"use client";
import { useState } from "react";
import { CalendarPlus, CircleCheck } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { Button } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import {
  productionPlaysIn,
  seasonForDate,
  shiftSeason,
  shortSeasonLabel,
  withProductionSeason,
} from "@/shared/period-filter";
import styles from "./production-season-action.module.css";

/** Wiederaufnahme: the same production continues, so its documents and plans stay shared. */
export function ProductionSeasonAction({
  production,
  disabled,
  onAdd,
}: {
  production: DomainRecord;
  disabled?: boolean;
  onAdd: (seasons: string[]) => Promise<unknown>;
}) {
  const { workspace } = useWorkspace();
  const [added, setAdded] = useState("");
  const current = seasonForDate(workspace.records.productions);
  const next = shiftSeason(current, 1) || "";
  const target = !productionPlaysIn(production.data, current)
    ? current
    : next && !productionPlaysIn(production.data, next)
      ? next
      : "";
  const confirmed = added && productionPlaysIn(production.data, added);
  if (confirmed)
    return (
      <span className={styles.status} role="status">
        <CircleCheck size={16} aria-hidden="true" />
        Spielt jetzt auch in {shortSeasonLabel(added)}.
      </span>
    );
  if (!target) return null;
  return (
    <Button
      variant={target === current ? "primary" : "secondary"}
      disabled={disabled}
      onClick={() =>
        void onAdd(withProductionSeason(production.data, target)).then(() => setAdded(target))
      }
    >
      <CalendarPlus size={15} aria-hidden="true" />
      {target === current
        ? "Zur aktuellen Spielzeit hinzufügen"
        : `Zur Spielzeit ${shortSeasonLabel(target)} hinzufügen`}
    </Button>
  );
}
