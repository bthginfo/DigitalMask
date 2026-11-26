"use client";
import { productionSeasons, seasonListLabel } from "@/shared/period-filter";

import { ArrowLeft } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { ResourceView } from "@/components/resource-view";
import { useWorkspace } from "@/components/workspace-context";
import { BackstageChanges } from "@/modules/documentation/components/backstage-changes";
import { MaskPlansModule } from "@/modules/mask-plans/components/mask-plans-module";
import { textValue, type DomainRecord } from "@/shared/contracts";
import { backstageChangesSection } from "@/shared/document-sections";
import styles from "@/components/workspace-browse.module.css";
import { SharedProductionOverview } from "./shared-production-overview";

const guestSections = [
  ["overview", "Überblick"],
  ["mask-plan", "Maskenplan"],
  ["looks", "Aufschriebe"],
  [backstageChangesSection.key, backstageChangesSection.name],
] as const;

/** Read-only production view for colleagues who work one of its performances or rehearsals. */
export function GuestProduction({
  production,
  tab,
  showStart,
  onTab,
  onBack,
}: {
  production: DomainRecord;
  tab: string;
  showStart: string;
  onTab: (tab: string) => void;
  onBack: () => void;
}) {
  const { workspace } = useWorkspace();
  const active = guestSections.some(([key]) => key === tab) ? tab : "overview";
  return (
    <section className={styles.productionDetail}>
      <div className="production-breadcrumb">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Alle Stücke
        </Button>
        <Badge tone="green">
          {seasonListLabel(productionSeasons(production.data)) || "Spielzeit"}
        </Badge>
      </div>
      <header className="production-heading">
        <div>
          <p className="eyebrow">Für deine Vorstellung · nur lesen</p>
          <h1>{textValue(production.data.title)}</h1>
        </div>
      </header>
      <label className={styles.productionSection}>
        Produktionsbereich
        <select
          aria-label="Produktionsbereich"
          value={active}
          onChange={(event) => onTab(event.target.value)}
        >
          {guestSections.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="tabs production-tabs" aria-label="Produktionsbereiche">
        {guestSections.map(([key, label]) => (
          <button
            key={key}
            aria-current={active === key ? "page" : undefined}
            className={active === key ? "active" : ""}
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {active === "mask-plan" ? (
        <MaskPlansModule
          key={`${production.id}:${showStart}`}
          production={production}
          showStart={showStart}
          readOnly
        />
      ) : active === "looks" ? (
        <ResourceView
          key={`${production.id}:looks`}
          kind="looks"
          canCreate={false}
          lockedProductionId={production.id}
          filter={(record) => record.data.productionId === production.id}
        />
      ) : active === backstageChangesSection.key ? (
        <BackstageChanges key={production.id} production={production} readOnly />
      ) : (
        <SharedProductionOverview
          production={production}
          workspace={workspace}
          onBack={onBack}
          embedded
        />
      )}
    </section>
  );
}
