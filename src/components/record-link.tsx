"use client";

import type { ComponentProps, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { recordHref } from "@/shared/client-navigation";
import type { DomainRecord } from "@/shared/contracts";
import { navigateRecord } from "@/shared/client-navigation";
import styles from "./record-links.module.css";

export function RecordLink({
  record,
  from,
  onNavigate,
  children,
  className = "",
  decoration = true,
  ...props
}: {
  record: DomainRecord;
  from?: DomainRecord;
  onNavigate?: () => void;
  children: ReactNode;
  decoration?: boolean;
} & Omit<ComponentProps<"a">, "href" | "onClick">) {
  return (
    <a
      {...props}
      href={recordHref(record)}
      className={`${decoration ? styles.link : styles.plain} ${className}`}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        )
          return;
        event.preventDefault();
        navigateRecord(record, { from, beforeNavigate: onNavigate });
      }}
    >
      {children}
      {decoration && <ArrowUpRight size={14} aria-hidden="true" />}
    </a>
  );
}
