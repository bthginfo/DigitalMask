import { textValue, type DomainRecord } from "@/shared/contracts";

/** Links cannot introduce mail headers, fragments, scripts or dialling control codes. */
export function emailHref(raw: string): string | undefined {
  const email = raw.trim();
  if (
    !/^[^\s@?&#%]+@[^\s@?&#%]+\.[^\s@?&#%]+$/u.test(email) ||
    /[\u0000-\u001f\u007f]/u.test(email)
  )
    return;
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}`;
}
export function phoneHref(raw: string): string | undefined {
  if (!/^[+\d\s()./-]+$/u.test(raw.trim())) return;
  const phone = (raw.trim().startsWith("+") ? raw.replace(/\(0\)/g, "") : raw).replace(
    /[\s()./-]/g,
    "",
  );
  return /^\+?\d{3,32}$/.test(phone) ? `tel:${phone}` : undefined;
}
export function filterPeople(
  records: DomainRecord[],
  query: string,
  organization = "",
): DomainRecord[] {
  const terms = query.trim().toLocaleLowerCase("de").split(/\s+/u).filter(Boolean);
  return records
    .filter((record) => {
      if (
        record.kind !== "people" ||
        (organization && textValue(record.data.organization) !== organization)
      )
        return false;
      const content = ["name", "organization", "position", "email", "phone", "notes"]
        .map((key) => textValue(record.data[key]))
        .join(" ")
        .toLocaleLowerCase("de");
      return terms.every((term) => content.includes(term));
    })
    .sort(
      (a, b) =>
        textValue(a.data.name).localeCompare(textValue(b.data.name), "de", {
          sensitivity: "base",
          numeric: true,
        }) || textValue(a.data.organization).localeCompare(textValue(b.data.organization), "de"),
    );
}
