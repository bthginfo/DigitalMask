"use client";
import { Mail, Phone } from "lucide-react";
import { textValue, type RecordData } from "@/shared/contracts";
import { emailHref, phoneHref } from "./person-data";
import styles from "./people.module.css";

export function PersonContactLinks({
  data,
  empty = "Keine Kontaktdaten hinterlegt",
}: {
  data: RecordData;
  empty?: string;
}) {
  const email = textValue(data.email),
    phone = textValue(data.phone);
  return (
    <div className={styles.contacts}>
      {email &&
        (emailHref(email) ? (
          <a
            className={styles.contact}
            href={emailHref(email)}
            aria-label={`E-Mail an ${textValue(data.name) || email}`}
          >
            <Mail size={15} />
            <span>{email}</span>
          </a>
        ) : (
          <span className={styles.contact}>
            <Mail size={15} />
            <span>{email}</span>
          </span>
        ))}
      {phone &&
        (phoneHref(phone) ? (
          <a
            className={styles.contact}
            href={phoneHref(phone)}
            aria-label={`${textValue(data.name) || "Kontakt"} anrufen: ${phone}`}
          >
            <Phone size={15} />
            <span>{phone}</span>
          </a>
        ) : (
          <span className={styles.contact}>
            <Phone size={15} />
            <span>{phone}</span>
          </span>
        ))}
      {!email && !phone && empty && <span className={styles.secondary}>{empty}</span>}
    </div>
  );
}
