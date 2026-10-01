import { textValue, type RecordData } from "./contracts";

export function personNameKey(name: unknown) {
  return textValue(name).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

const matchingKey = (name: unknown) =>
  personNameKey(name)
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
export function personNameMatches(a: unknown, b: unknown) {
  const left = matchingKey(a),
    right = matchingKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const parts = (name: string) => {
    const [first, ...rest] = name.split(" ");
    const surname = rest.join(" ").replace(/\.$/, "");
    return {
      first,
      surname,
      abbreviated: surname.length === 1 || (rest.length === 1 && /\.$/.test(rest[0])),
    };
  };
  const x = parts(left),
    y = parts(right);
  return Boolean(
    x.surname &&
    y.surname &&
    x.first === y.first &&
    ((x.abbreviated && y.surname.startsWith(x.surname)) ||
      (y.abbreviated && x.surname.startsWith(y.surname))),
  );
}

export function uniqueMemberForContact<T extends { id: string; name: string }>(
  name: string,
  members: T[],
  knownNames: string[] = [],
): T | undefined {
  const exact = [
    ...new Map(
      members
        .filter((member) => matchingKey(member.name) === matchingKey(name))
        .map((member) => [member.id, member]),
    ).values(),
  ];
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const candidates = [
    ...new Map(
      members
        .filter((member) => personNameMatches(name, member.name))
        .map((member) => [member.id, member]),
    ).values(),
  ];
  if (candidates.length !== 1) return undefined;
  const fullNames = new Set(
    [...knownNames, ...members.map((member) => member.name)]
      .filter((candidate) => {
        const surname = matchingKey(candidate).split(" ").slice(1).join(" ");
        return surname.length > 1 && !surname.endsWith(".") && personNameMatches(name, candidate);
      })
      .map(matchingKey),
  );
  return fullNames.size > 1 ? undefined : candidates[0];
}

export function isMakeupContact(contact: { type?: string; role?: string }) {
  return (
    contact.type === "makeup" ||
    /^masken(?:betreuung|assistenz|ansprechperson)$/.test(
      personNameKey(contact.role).replace(/\s+/g, ""),
    )
  );
}

/** Keep the primary value and preserve alternate details in notes during a merge. */
export function mergePersonData(primary: RecordData, others: RecordData[]): RecordData {
  const result = { ...primary };
  const notes = new Set(
    [primary, ...others].map((data) => textValue(data.notes).trim()).filter(Boolean),
  );
  for (const [key, label] of [
    ["organization", "Organisation"],
    ["position", "Funktion"],
    ["email", "E-Mail"],
    ["phone", "Telefon"],
  ]) {
    const values = Array.from(
      new Set([primary, ...others].map((data) => textValue(data[key]).trim()).filter(Boolean)),
    );
    result[key] = values[0] || "";
    if (values.length > 1) notes.add(`${label} (weitere Angaben): ${values.slice(1).join("; ")}`);
  }
  result.notes = Array.from(notes).join("\n\n");
  return result;
}

/** Replace only known reference fields; names and unrelated free text stay intact. */
export function replacePersonReferences(
  value: unknown,
  replacements: Map<string, string>,
): unknown {
  if (Array.isArray(value)) return value.map((item) => replacePersonReferences(item, replacements));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      ["personId", "recordId", "parentId"].includes(key) && typeof item === "string"
        ? replacements.get(item) || item
        : replacePersonReferences(item, replacements),
    ]),
  );
}
