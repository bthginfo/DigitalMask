import { listValue, type RecordData } from "@/shared/contracts";

type PortraitFile = { id: string; data: RecordData };
export const isOwnedPortrait = (file: PortraitFile, actorId: string) =>
  file.data.recordId === actorId &&
  file.data.recordKind === "actors" &&
  (file.data.image === true || String(file.data.mime || "").startsWith("image/"));

export function selectActorPortrait<T extends PortraitFile>(
  actorId: string,
  data: RecordData,
  files: T[],
) {
  const own = files.filter((file) => isOwnedPortrait(file, actorId));
  return (
    own.find((file) => file.id === data.portraitFileId) ||
    listValue(data.imageIds)
      .map((id) => own.find((file) => file.id === id))
      .find(Boolean) ||
    own[0]
  );
}
