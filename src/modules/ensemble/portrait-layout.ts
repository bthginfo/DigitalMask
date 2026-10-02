import { textValue, type DomainRecord } from "@/shared/contracts";

export interface PortraitFocus {
  x: number;
  y: number;
  faceWidth: number;
  faceHeight: number;
  detected: boolean;
  version: 1;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const unit = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 1) : fallback;

export function portraitFocus(raw: unknown): PortraitFocus {
  const value = raw && typeof raw === "object" ? (raw as Partial<PortraitFocus>) : {};
  return {
    x: unit(value.x, 0.5),
    y: unit(value.y, 0.24),
    faceWidth: unit(value.faceWidth, 0),
    faceHeight: unit(value.faceHeight, 0),
    detected: value.detected === true,
    version: 1,
  };
}

/** CSS percentage object-position refers to overflow, not a point in the photo. */
export function portraitLayout(
  image: { width: number; height: number },
  frame: { width: number; height: number },
  focus: PortraitFocus,
) {
  if (
    ![image.width, image.height, frame.width, frame.height].every(
      (number) => Number.isFinite(number) && number > 0,
    )
  )
    return;
  let scale = Math.max(frame.width / image.width, frame.height / image.height);
  if (focus.detected) {
    const widthScale =
      focus.faceWidth > 0 ? frame.width / (image.width * focus.faceWidth * 1.2) : Infinity;
    const heightScale =
      focus.faceHeight > 0 ? frame.height / (image.height * focus.faceHeight * 1.2) : Infinity;
    scale = Math.min(scale, widthScale, heightScale);
  }
  const width = image.width * scale,
    height = image.height * scale;
  const offset = (viewport: number, rendered: number, point: number) =>
    rendered <= viewport
      ? (viewport - rendered) / 2
      : clamp(viewport / 2 - point * rendered, viewport - rendered, 0);
  return {
    width,
    height,
    left: offset(frame.width, width, focus.x),
    top: offset(frame.height, height, focus.y),
  };
}

export function actorPortrait(actor: DomainRecord, files: DomainRecord[]) {
  const photos = files.filter(
    (file) =>
      file.data.recordKind === "actors" &&
      file.data.recordId === actor.id &&
      textValue(file.data.mime).startsWith("image/"),
  );
  return (
    photos.find((file) => file.id === actor.data.portraitFileId) ||
    photos.find((file) => !textValue(file.data.sourceUrl)) ||
    photos[0]
  );
}
