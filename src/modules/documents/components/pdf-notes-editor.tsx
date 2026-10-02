"use client";
import { useState } from "react";
import * as Y from "yjs";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { Member } from "@/shared/contracts";
import { PDF_NOTES } from "../contracts";
import { NOTE_EDIT } from "../client/shared-document";
import { useDocumentRevision } from "../client/use-document-revision";

function replaceText(text: Y.Text, value: string) {
  const original = text.toString();
  let prefix = 0,
    suffix = 0;
  while (prefix < original.length && prefix < value.length && original[prefix] === value[prefix])
    prefix++;
  while (
    suffix < original.length - prefix &&
    suffix < value.length - prefix &&
    original[original.length - suffix - 1] === value[value.length - suffix - 1]
  )
    suffix++;
  if (original.length - prefix - suffix > 0) text.delete(prefix, original.length - prefix - suffix);
  if (value.length - prefix - suffix > 0)
    text.insert(prefix, value.slice(prefix, value.length - suffix));
}
export function PdfNotesEditor({
  doc,
  fileId,
  pages,
  user,
  editable,
}: {
  doc: Y.Doc;
  fileId: string;
  pages: number;
  user: Member;
  editable: boolean;
}) {
  useDocumentRevision(doc);
  const notes = doc.getArray<Y.Map<unknown>>(PDF_NOTES);
  const [tab, setTab] = useState<"file" | "notes">("notes"),
    [page, setPage] = useState(1);
  const addNote = () =>
    doc.transact(() => {
      const note = new Y.Map<unknown>();
      note.set("id", crypto.randomUUID());
      note.set("page", page);
      note.set("authorId", user.id);
      note.set("authorName", user.name);
      note.set("createdAt", new Date().toISOString());
      note.set("text", new Y.Text());
      notes.push([note]);
    }, NOTE_EDIT);
  return (
    <div className={`shared-pdf-editor show-${tab}`}>
      <div className="pdf-mobile-tabs segmented">
        <button className={tab === "file" ? "active" : ""} onClick={() => setTab("file")}>
          PDF ansehen
        </button>
        <button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}>
          Gemeinsame Notizen
        </button>
      </div>
      <div className="pdf-original-view">
        <iframe title="Original-PDF" src={`/api/files/${fileId}#page=${page}`} />
        <a className="text-button" href={`/api/files/${fileId}`} target="_blank" rel="noreferrer">
          PDF in groß öffnen ↗
        </a>
      </div>
      <section className="pdf-notes-panel" aria-label="Gemeinsame Notizen">
        <header>
          <h3>Gemeinsame Notizen</h3>
          <p className="small muted">
            Eure Hinweise werden beim PDF-Download als zusätzliche Seiten angefügt.
          </p>
        </header>
        <div className="pdf-add-note">
          <label>
            Seite
            <select
              value={page}
              aria-label="PDF-Seite"
              onChange={(event) => setPage(Number(event.target.value))}
            >
              {Array.from({ length: Math.max(1, pages) }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={!editable} onClick={addNote}>
            <Plus size={16} /> Notiz
          </Button>
        </div>
        <div className="pdf-notes-list">
          {notes.length ? (
            notes.toArray().map((note, index) => {
              const text = note.get("text");
              return (
                <article className="pdf-shared-note" key={String(note.get("id"))}>
                  <header>
                    <span>Seite {String(note.get("page"))}</span>
                    <span className="small muted">{String(note.get("authorName") || "Team")}</span>
                    {editable && (
                      <button
                        className="icon-button"
                        aria-label={`Notiz auf Seite ${note.get("page")} löschen`}
                        onClick={() => doc.transact(() => notes.delete(index, 1), NOTE_EDIT)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </header>
                  <textarea
                    aria-label={`Notiz auf Seite ${note.get("page")} von ${note.get("authorName")}`}
                    rows={4}
                    maxLength={10000}
                    readOnly={!editable}
                    value={text instanceof Y.Text ? text.toString() : ""}
                    placeholder="Was möchtest du dem Team dazu sagen?"
                    onChange={(event) => {
                      if (text instanceof Y.Text && editable)
                        doc.transact(() => replaceText(text, event.target.value), NOTE_EDIT);
                    }}
                  />
                </article>
              );
            })
          ) : (
            <div className="document-notes-empty">
              <strong>Noch keine Notizen</strong>
              <p>Wähle eine Seite und ergänze euren ersten Hinweis.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
