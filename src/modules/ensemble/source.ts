import { load } from "cheerio";
import { HttpError } from "@/platform/http";

export const ensembleOrigin = "https://theater.ingolstadt.de";
export const ensembleUrl = `${ensembleOrigin}/ensemble/schauspielerinnen.html`;
export const guestsUrl = `${ensembleUrl}?tx_ttaddress_listview%5Boverride%5D%5Bcategories%5D=7&cHash=440adf530d323af77669918e48fd34cd`;
export const youngTheatreUrl = `${ensembleOrigin}/junges-theater/ensemble-jt.html`;
export interface EnsemblePerson {
  sourceId: string;
  name: string;
  sourceUrl: string;
  biography: string;
  ensembleStatus: string;
  imageUrl: string;
  imageCredit: string;
  productions: string[];
}
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
export function sourceAssetUrl(value: string) {
  const url = new URL(value, ensembleOrigin);
  if (
    url.origin !== ensembleOrigin ||
    !url.pathname.startsWith("/fileadmin/") ||
    url.username ||
    url.password
  )
    throw new HttpError(502, "Das Theaterbild hat eine unerwartete Adresse.");
  return url.href;
}
function portraitSourceUrl(value: string | undefined) {
  if (!value) return "";
  const url = sourceAssetUrl(value);
  // The theatre also publishes generic silhouette images for guests without a portrait.
  return /platzhalter|placeholder/i.test(new URL(url).pathname) ? "" : url;
}
export function parseEnsemble(html: string, defaultStatus = ""): EnsemblePerson[] {
  const $ = load(html);
  const result: EnsemblePerson[] = [];
  $(".tt_address_list .vcard").each((_, element) => {
    const card = $(element);
    const link = card.find("figcaption a[href]").first();
    const url = new URL(link.attr("href") || "/", ensembleOrigin);
    const id = url.pathname.match(
      /^\/(?:ensemble\/schauspielerinnen\/schauspielerinnen-detailseite|junges-theater\/ensemble-jt\/ensemble-jt-detailseite)\/(\d+)\.html$/,
    )?.[1];
    if (!id || url.origin !== ensembleOrigin) return;
    const text = clean(link.text());
    const status = text.match(/\(([^)]+)\)\s*$/)?.[1] || defaultStatus;
    const name = text.replace(/\s*\([^)]+\)\s*$/, "");
    if (!name || name.length > 200) return;
    const image = card.find("img").first().attr("src");
    result.push({
      sourceId: id,
      name,
      sourceUrl: url.href,
      biography: "",
      ensembleStatus: status,
      imageUrl: portraitSourceUrl(image),
      imageCredit: "Stadttheater Ingolstadt",
      productions: [],
    });
  });
  const unique = [...new Map(result.map((person) => [person.sourceId, person])).values()];
  if (!unique.length || unique.length > 100)
    throw new HttpError(
      502,
      "Die Ensemble-Liste konnte nicht gelesen werden. Bitte versuche es später erneut.",
    );
  return unique;
}
export function parseProfile(html: string, person: EnsemblePerson): EnsemblePerson {
  const $ = load(html);
  const detail = $(".tt_address_detail").first();
  if (!detail.find("[itemprop=name]").text().trim())
    throw new HttpError(502, "Das Theaterprofil konnte nicht gelesen werden.");
  const paragraphs: string[] = [],
    productions: string[] = [];
  $(".fetchurl").each((_, element) => {
    const block = $(element);
    if (block.find("h1").length)
      block.children("p").each((_, p) => {
        const text = clean($(p).text());
        if (text) paragraphs.push(text);
      });
    if (/^Aktuelle Produktionen:?$/i.test(clean(block.find("h2").first().text())))
      block.find("li").each((_, li) => {
        const text = clean($(li).text());
        if (text) productions.push(text.slice(0, 500));
      });
  });
  const image = detail.find("img").first().attr("src");
  const credit =
    clean(detail.find("figcaption,.image-caption").text()) || "Stadttheater Ingolstadt";
  return {
    ...person,
    biography: paragraphs.join("\n\n").slice(0, 20000),
    productions: productions.slice(0, 100),
    imageUrl: portraitSourceUrl(image) || person.imageUrl,
    imageCredit: credit.slice(0, 200),
  };
}

/** Fixed origin, bounded bodies, no redirects: imported pages cannot turn this into an SSRF proxy. */
export async function fetchTheatre(url: string, image = false) {
  const parsed = new URL(url);
  if (parsed.origin !== ensembleOrigin || parsed.username || parsed.password)
    throw new HttpError(400, "Ungültige Theateradresse.");
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "DigitalMask/1.0 (Stadttheater ensemble import)",
        Accept: image ? "image/jpeg,image/png,image/webp" : "text/html",
      },
      ...(image ? { cache: "no-store" as const } : { next: { revalidate: 3600 } }),
    });
    if (!response.ok || !response.body) throw new Error("Source unavailable");
    const limit = image ? 4_000_000 : 2_000_000;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) throw new Error("Body limit");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return { bytes: Buffer.concat(chunks), type: response.headers.get("content-type") || "" };
  } catch {
    throw new HttpError(
      502,
      image
        ? "Das Theaterfoto konnte nicht geladen werden. Du kannst den Import erneut starten."
        : "Die Theaterseite ist gerade nicht erreichbar. Bitte versuche es später erneut.",
    );
  }
}
export async function getEnsemble() {
  const [house, guests, youngTheatre] = await Promise.all([
    fetchTheatre(ensembleUrl),
    fetchTheatre(guestsUrl),
    fetchTheatre(youngTheatreUrl),
  ]);
  return mergeEnsembleLists(
    parseEnsemble(house.bytes.toString("utf8")),
    parseEnsemble(guests.bytes.toString("utf8"), "Gast"),
    parseEnsemble(youngTheatre.bytes.toString("utf8")),
  );
}
export function mergeEnsembleLists(...lists: EnsemblePerson[][]) {
  const result = new Map<string, EnsemblePerson>();
  for (const people of lists) {
    for (const person of people) {
      const existing = result.get(person.sourceId);
      result.set(
        person.sourceId,
        existing ? { ...existing, imageUrl: existing.imageUrl || person.imageUrl } : person,
      );
    }
  }
  if (result.size > 100) throw new HttpError(502, "Die Ensemble-Liste ist unerwartet groß.");
  return [...result.values()];
}
export async function getProfile(person: EnsemblePerson) {
  return parseProfile((await fetchTheatre(person.sourceUrl)).bytes.toString("utf8"), person);
}
