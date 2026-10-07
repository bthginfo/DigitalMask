"use client";
import { textLinks } from "@/shared/text-links";
import styles from "./linked-text.module.css";

export function LinkedText({ children }: { children: string }) {
  return (
    <>
      {textLinks(children).map((part, index) =>
        part.href ? (
          <a
            key={index}
            href={part.href}
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
