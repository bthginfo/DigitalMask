"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRight, FileText, Image as ImageIcon, Paperclip, Table2 } from "lucide-react";
import { isImageAttachment } from "@/components/image-gallery";
import type { DomainRecord } from "@/shared/contracts";
import { value } from "@/shared/client-api";
import { documentFormat } from "../contracts";
import "../documents.css";
const DocumentEditor = dynamic(() => import("./document-editor"), { ssr: false });

export function DocumentAttachment({
  file,
  compact = false,
  onOpenImage,
}: {
  file: DomainRecord;
  compact?: boolean;
  onOpenImage?: (id: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  const format = documentFormat(file.data.mime);
  const Icon = format === "sheet" ? Table2 : format ? FileText : Paperclip;
  const className = compact
    ? "message-attachment shared-document-attachment"
    : "file-tile shared-document-attachment";
  if (onOpenImage && isImageAttachment(file))
    return (
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        onClick={() => onOpenImage(file.id)}
      >
        <ImageIcon size={compact ? 15 : 24} aria-hidden="true" />
        <span>{value(file.data, "name") || "Bild öffnen"}</span>
      </button>
    );
  return (
    <>
      {format ? (
        <button
          type="button"
          className={className}
          onClick={() => setOpened(true)}
          title="Gemeinsam öffnen und bearbeiten"
        >
          <Icon size={compact ? 15 : 24} />
          <span>{value(file.data, "name")}</span>
          <ArrowUpRight size={14} />
        </button>
      ) : (
        <a className={className} href={`/api/files/${file.id}`} target="_blank" rel="noreferrer">
          <Icon size={compact ? 15 : 24} />
          <span>{value(file.data, "name")}</span>
        </a>
      )}
      {opened && <DocumentEditor file={file} onClose={() => setOpened(false)} />}
    </>
  );
}
