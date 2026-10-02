"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, ErrorMessage, Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { value } from "@/shared/client-api";
import { isActiveStaff } from "@/shared/client-members";
import type { DomainRecord } from "@/shared/contracts";
import { maskPlanClock, type MaskPlanBlock, type MaskPlanData, type MaskPlanLane } from "../model";
import { NamePicker } from "./name-picker";
import styles from "./mask-plans.module.css";
import { numberDraft, parseNumberDraft, previewNumberDraft } from "@/shared/number-draft";

function closeEdited(previous: unknown, next: unknown, close: () => void) {
  if (
    JSON.stringify(previous) === JSON.stringify(next) ||
    confirm("Diese Formulareingaben verwerfen?")
  )
    close();
}

export function PlanOptions({
  plan,
  creating = false,
  onApply,
  onClose,
}: {
  plan: MaskPlanData;
  creating?: boolean;
  onApply: (plan: MaskPlanData) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState(plan);
  const [windowMinutes, setWindowMinutes] = useState(numberDraft(plan.windowMinutes));
  const [error, setError] = useState("");
  const close = () =>
    closeEdited(
      { data: plan, windowMinutes: numberDraft(plan.windowMinutes) },
      { data, windowMinutes },
      onClose,
    );
  return (
    <Modal
      title={creating ? "Maskenplan anlegen" : "Plan bearbeiten"}
      onClose={close}
      className={styles.modal}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onApply({
              ...data,
              windowMinutes: parseNumberDraft(windowMinutes, {
                label: "Vorlauf in Minuten",
                required: true,
                min: 5,
                max: 720,
                integer: true,
              })!,
            });
            onClose();
          } catch (exception) {
            setError(exception instanceof Error ? exception.message : "Bitte prüfe den Vorlauf.");
          }
        }}
      >
        <label>
          Planname
          <input
            required
            maxLength={200}
            value={data.title}
            onChange={(event) => setData({ ...data, title: event.target.value })}
            placeholder="Zum Beispiel AMA / HP1+2 / GP / Premiere"
          />
        </label>
        <div className={styles.formGrid}>
          <label>
            Vorlauf in Minuten
            <input
              type="number"
              required
              min={5}
              max={720}
              value={windowMinutes}
              onChange={(event) => {
                setWindowMinutes(event.target.value);
                setError("");
              }}
            />
          </label>
          <label>
            Zeitraster
            <select
              value={data.stepMinutes}
              onChange={(event) =>
                setData({
                  ...data,
                  stepMinutes: Number(event.target.value) as MaskPlanData["stepMinutes"],
                })
              }
            >
              {[1, 5, 10, 15].map((step) => (
                <option key={step} value={step}>
                  {step} {step === 1 ? "Minute" : "Minuten"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.hint}>
          Die Tabelle endet bei 0: Vorstellungsbeginn. Frühere Zeitblöcke verlängern den Vorlauf
          automatisch. Ihre Dauer darf vom Raster abweichen.
        </p>
        <label>
          Hinweise zum Plan (optional)
          <textarea
            maxLength={4000}
            rows={3}
            value={data.notes}
            onChange={(event) => setData({ ...data, notes: event.target.value })}
          />
        </label>
        <ErrorMessage message={error} />
        <footer className="dialog-footer">
          <Button onClick={close}>Abbrechen</Button>
          <Button type="submit" variant="primary">
            {creating ? "Plan anlegen" : "Übernehmen"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

export function LaneEditor({
  lane,
  creating = false,
  blockCount,
  onApply,
  onRemove,
  onClose,
}: {
  lane: MaskPlanLane;
  creating?: boolean;
  blockCount: number;
  onApply: (lane: MaskPlanLane) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const [data, setData] = useState(lane);
  const members = workspace.members.filter(
    (member) =>
      member.role !== "superadmin" && (isActiveStaff(member) || data.memberIds.includes(member.id)),
  );
  const missing = data.memberIds.filter(
    (id) => !workspace.members.some((member) => member.id === id),
  );
  return (
    <Modal
      title={creating ? "Personalspalte hinzufügen" : "Personalspalte bearbeiten"}
      onClose={() => closeEdited(lane, data, onClose)}
      className={styles.modal}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(data);
          onClose();
        }}
      >
        <label>
          Spaltenname (optional)
          <input
            maxLength={200}
            value={data.label}
            onChange={(event) => setData({ ...data, label: event.target.value })}
            placeholder="Zum Beispiel Platz 1 oder gemeinsam"
          />
        </label>
        <NamePicker
          legend="Maskenpersonal"
          options={[
            ...members.map((member) => ({
              id: member.id,
              name: member.name,
              historical: !isActiveStaff(member),
            })),
            ...missing.map((id) => ({ id, name: "Frühere Maskenperson", historical: true })),
          ]}
          selected={data.memberIds}
          names={data.staffNames}
          onSelected={(memberIds) => setData({ ...data, memberIds })}
          onNames={(staffNames) => setData({ ...data, staffNames })}
        />
        <p className={styles.hint}>
          Mehrere Personen dürfen eine Spalte teilen. Freie Namen benötigen keinen Account.
        </p>
        <footer className={`dialog-footer ${styles.editorFooter}`}>
          {!creating && (
            <Button
              variant="danger-ghost"
              onClick={() => {
                if (
                  confirm(
                    `Diese Personalspalte und ${blockCount ? `alle ${blockCount} zugehörigen Zeitblöcke` : "ihre Zuordnung"} aus dem Entwurf entfernen? Die Änderung gilt erst nach dem Speichern des Plans.`,
                  )
                ) {
                  onRemove();
                  onClose();
                }
              }}
            >
              <Trash2 size={16} />
              Spalte entfernen
            </Button>
          )}
          <Button onClick={() => closeEdited(lane, data, onClose)}>Abbrechen</Button>
          <Button type="submit" variant="primary">
            Übernehmen
          </Button>
        </footer>
      </form>
    </Modal>
  );
}

const blockColors = ["", "#83c6a5", "#bfaee0", "#f0c791", "#91c8df", "#e9aebc", "#d5c6a1"];

export function BlockEditor({
  block,
  plan,
  castActors,
  castNames,
  performanceTime,
  creating = false,
  onApply,
  onRemove,
  onClose,
}: {
  block: MaskPlanBlock;
  plan: MaskPlanData;
  castActors: DomainRecord[];
  castNames: string[];
  performanceTime: string;
  creating?: boolean;
  onApply: (block: MaskPlanBlock) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const [data, setData] = useState(block);
  const [startMinutes, setStartMinutes] = useState(numberDraft(-block.startMinutes));
  const [durationMinutes, setDurationMinutes] = useState(numberDraft(block.durationMinutes));
  const [error, setError] = useState("");
  const actors = [
    ...castActors,
    ...workspace.records.actors.filter(
      (actor) =>
        data.actorIds.includes(actor.id) &&
        !castActors.some((candidate) => candidate.id === actor.id),
    ),
  ];
  const unknown = data.actorIds.filter((id) => !actors.some((actor) => actor.id === id));
  const startValue = previewNumberDraft(startMinutes, { min: 1, max: 720, integer: true });
  const durationValue = previewNumberDraft(durationMinutes, { min: 1, max: 720, integer: true });
  const end =
    startValue === undefined || durationValue === undefined
      ? undefined
      : -startValue + durationValue;
  const clock = startValue === undefined ? "" : maskPlanClock(-startValue, performanceTime);
  const close = () =>
    closeEdited(
      {
        data: block,
        startMinutes: numberDraft(-block.startMinutes),
        durationMinutes: numberDraft(block.durationMinutes),
      },
      { data, startMinutes, durationMinutes },
      onClose,
    );
  return (
    <Modal
      title={creating ? "Zeitblock hinzufügen" : "Zeitblock bearbeiten"}
      onClose={close}
      wide
      className={styles.modal}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          let parsedStart: number, parsedDuration: number;
          try {
            parsedStart = -parseNumberDraft(startMinutes, {
              label: "Minuten vor Beginn",
              required: true,
              min: 1,
              max: 720,
              integer: true,
            })!;
            parsedDuration = parseNumberDraft(durationMinutes, {
              label: "Dauer in Minuten",
              required: true,
              min: 1,
              max: 720,
              integer: true,
            })!;
          } catch (exception) {
            setError(
              exception instanceof Error ? exception.message : "Bitte prüfe Zeit und Dauer.",
            );
            return;
          }
          if (parsedStart + parsedDuration > 0) {
            setError(
              "Der Zeitblock endet nach dem Vorstellungsbeginn. Verkürze die Dauer oder beginne früher.",
            );
            return;
          }
          if (!(data.title.trim() || data.actorIds.length || data.actorNames.length)) {
            setError("Wähle mindestens eine Schauspielperson oder trage eine Tätigkeit ein.");
            return;
          }
          onApply({ ...data, startMinutes: parsedStart, durationMinutes: parsedDuration });
          onClose();
        }}
      >
        <label>
          Personalspalte
          <select
            required
            value={data.laneId}
            onChange={(event) => setData({ ...data, laneId: event.target.value })}
          >
            {plan.lanes.map((lane, index) => (
              <option key={lane.id} value={lane.id}>
                {[
                  lane.label,
                  ...lane.memberIds.map(
                    (id) => workspace.members.find((member) => member.id === id)?.name,
                  ),
                  ...lane.staffNames,
                ]
                  .filter(Boolean)
                  .join(" / ") || `Spalte ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.formGrid}>
          <label>
            Minuten vor Beginn
            <input
              required
              type="number"
              min={1}
              max={720}
              value={startMinutes}
              onChange={(event) => {
                setStartMinutes(event.target.value);
                setError("");
              }}
            />
          </label>
          <label>
            Dauer in Minuten
            <input
              required
              type="number"
              min={1}
              max={720}
              value={durationMinutes}
              onChange={(event) => {
                setDurationMinutes(event.target.value);
                setError("");
              }}
            />
          </label>
        </div>
        <p className={styles.timingPreview}>
          {end === undefined ? (
            "Bitte Zeit und Dauer eintragen."
          ) : (
            <>
              Von {-startValue!} bis {end === 0 ? "0 · Beginn" : end} Minuten
              {clock ? ` · ${clock}–${maskPlanClock(end, performanceTime)}` : ""}
            </>
          )}
        </p>
        <NamePicker
          legend="Schauspieler aus dieser Besetzung"
          options={[
            ...actors.map((actor) => ({
              id: actor.id,
              name: value(actor.data, "name"),
              historical: !castActors.some((candidate) => candidate.id === actor.id),
            })),
            ...unknown.map((id) => ({ id, name: "Frühere Schauspielperson", historical: true })),
          ]}
          selected={data.actorIds}
          names={data.actorNames}
          suggestions={castNames}
          onSelected={(actorIds) => setData({ ...data, actorIds })}
          onNames={(actorNames) => setData({ ...data, actorNames })}
        />
        <label>
          Tätigkeit / Zusatz (optional)
          <input
            maxLength={500}
            value={data.title}
            onChange={(event) => setData({ ...data, title: event.target.value })}
            placeholder="Zum Beispiel Ins Studio rüber"
          />
        </label>
        <label>
          Hinweise (optional)
          <textarea
            rows={3}
            maxLength={4000}
            value={data.notes}
            onChange={(event) => setData({ ...data, notes: event.target.value })}
          />
        </label>
        <fieldset className={styles.colors}>
          <legend>Blockfarbe</legend>
          {blockColors.map((color, index) => (
            <label
              key={color}
              className={styles.colorChoice}
              style={color ? ({ "--choice-color": color } as React.CSSProperties) : undefined}
            >
              <input
                type="radio"
                name="block-color"
                checked={data.color === color}
                onChange={() => setData({ ...data, color })}
              />
              <span className={color ? styles.swatch : styles.defaultSwatch} aria-hidden="true" />
              <span>
                {["Standard", "Grün", "Lavendel", "Apricot", "Blau", "Rosé", "Sand"][index]}
              </span>
            </label>
          ))}
        </fieldset>
        <label>
          Eigene Farbe (optional)
          <input
            type="color"
            value={data.color || "#83c6a5"}
            onChange={(event) => setData({ ...data, color: event.target.value })}
          />
        </label>
        <ErrorMessage message={error} />
        <footer className={`dialog-footer ${styles.editorFooter}`}>
          {!creating && (
            <Button
              variant="danger-ghost"
              onClick={() => {
                if (
                  confirm(
                    "Diesen Zeitblock aus dem Entwurf entfernen? Die Änderung gilt erst nach dem Speichern des Plans.",
                  )
                ) {
                  onRemove();
                  onClose();
                }
              }}
            >
              <Trash2 size={16} />
              Block entfernen
            </Button>
          )}
          <Button onClick={close}>Abbrechen</Button>
          <Button type="submit" variant="primary">
            Übernehmen
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
