"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import type { DomainRecord } from "@/shared/contracts";
import { value } from "@/shared/client-api";
import { DocumentAttachment } from "@/modules/documents/components/document-attachment";
import { ImageGallery, isImageAttachment } from "./image-gallery";
import styles from "./image-gallery.module.css";

export function AttachmentGrid({
  files,
  renderImage,
  onRemove,
}: {
  files: DomainRecord[];
  renderImage?: (file: DomainRecord) => ReactNode;
  onRemove?: (file: DomainRecord) => void;
}) {
  return (
    <ImageGallery files={files}>
      {(openImage) => (
        <div className="gallery">
          {files.map((file) => {
            const name = value(file.data, "name");
            return (
              <div className="gallery-item" key={file.id}>
                {isImageAttachment(file) ? (
                  <button
                    type="button"
                    className={styles.trigger}
                    aria-haspopup="dialog"
                    aria-label={`${name || "Bild"} vergrößern`}
                    onClick={() => openImage(file.id)}
                  >
                    {renderImage?.(file) ?? (
                      <Image
                        unoptimized
                        width={1800}
                        height={1800}
                        src={`/api/files/${file.id}`}
                        alt={name}
                        loading="lazy"
                      />
                    )}
                  </button>
                ) : (
                  <DocumentAttachment file={file} />
                )}
                <div className="gallery-caption">
                  <span>{name}</span>
                  {onRemove && (
                    <button
                      type="button"
                      className="icon-button"
                      title="Datei löschen"
                      aria-label={`${name} löschen`}
                      onClick={() => onRemove(file)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ImageGallery>
  );
}
