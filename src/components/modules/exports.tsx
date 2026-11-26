"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import type { RecordKind } from "@/shared/contracts";
import { labels } from "../resource-fields";
import { ExportDialog } from "../export-dialog";

const exportKinds: RecordKind[] = [
  "events",
  "time",
  "attendance",
  "people",
  "productions",
  "actors",
  "casting",
  "looks",
  "tasks",
  "materials",
  "handovers",
];

export function ExportsModule() {
  const [kind, setKind] = useState<RecordKind | null>(null);
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">DIE RICHTIGE ANSICHT FÜR JEDEN ZWECK</p>
          <h1>Exporte & Ausdrucke</h1>
          <p className="muted">
            Kalender, Arbeitszeit und Theaterwissen als PDF, Excel oder offene Daten.
          </p>
        </div>
      </header>
      <div className="export-options">
        {exportKinds.map((item) => (
          <button key={item} onClick={() => setKind(item)}>
            <Download size={22} />
            <div>
              <h3>{labels[item][0]}</h3>
              <p className="small muted">
                {item === "events"
                  ? "Monat, Woche, Tag, Agenda & Team · PDF, ICS, Excel"
                  : "PDF für Ausdrucke · Excel, CSV & JSON für Daten"}
              </p>
            </div>
            <span>Exportieren →</span>
          </button>
        ))}
      </div>
      {kind && <ExportDialog kind={kind} onClose={() => setKind(null)} />}
    </>
  );
}
