"use client";
import { useState } from "react";
import { History } from "lucide-react";
import type { DomainRecord, RecordData } from "@/shared/contracts";
import { api, dateLabel } from "@/shared/client-api";
import { Button, ErrorMessage } from "./ui";
import { fields } from "./resource-fields";
import { useWorkspace } from "./workspace-context";
type Version = {
  id: string;
  recordId: string;
  version: number;
  data: RecordData;
  createdBy: string;
  createdAt: string;
};
export function HistoryPanel({ record }: { record: DomainRecord }) {
  const { workspace } = useWorkspace();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const load = async () => {
    setOpen(!open);
    if (versions || open) return;
    setBusy(true);
    try {
      const result = await api<{ versions: Version[] }>(
        `/api/history?id=${encodeURIComponent(record.id)}`,
      );
      setVersions(result.versions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Historie konnte nicht geladen werden.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="detail-section">
      <Button onClick={() => void load()}>
        <History size={16} />
        {open ? "Versionshistorie schließen" : "Versionshistorie ansehen"}
      </Button>
      {open && (
        <>
          {busy && <p className="empty-inline">Versionen werden geladen …</p>}
          <ErrorMessage message={error} />
          {versions?.length === 0 && <p className="empty-inline">Noch keine früheren Versionen.</p>}
          {versions?.map((version) => (
            <details
              key={version.id}
              open={selected === version.id}
              onToggle={(event) => {
                if (event.currentTarget.open) setSelected(version.id);
              }}
              className="history-version"
            >
              <summary>
                Version {version.version} · {dateLabel(version.createdAt, true)} ·{" "}
                {workspace.members.find((x) => x.id === version.createdBy)?.name || "Teammitglied"}
              </summary>
              <dl className="detail-grid">
                {(fields[record.kind] || [])
                  .filter(
                    (field) =>
                      version.data[field.key] !== undefined &&
                      !field.source &&
                      field.type !== "checklist",
                  )
                  .map((field) => (
                    <div key={field.key} className={field.type === "textarea" ? "field-wide" : ""}>
                      <dt>{field.label}</dt>
                      <dd>
                        {Array.isArray(version.data[field.key])
                          ? (version.data[field.key] as string[]).join(" · ")
                          : String(version.data[field.key] || "–")}
                      </dd>
                    </div>
                  ))}
              </dl>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
