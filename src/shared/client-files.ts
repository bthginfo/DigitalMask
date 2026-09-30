const MAX_UPLOAD = 4 * 1024 * 1024;
export async function prepareUpload(file: File): Promise<File> {
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/gif" ||
    file.type === "image/svg+xml"
  ) {
    if (file.size > MAX_UPLOAD)
      throw new Error(
        "Dateien dürfen maximal 4 MB groß sein. Bitte verkleinere die Datei vor dem Hochladen.",
      );
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size <= MAX_UPLOAD) return file;
    throw new Error(
      "Das Bild konnte nicht verkleinert werden. Bitte verwende ein JPEG-, PNG- oder WebP-Bild unter 4 MB.",
    );
  }
  try {
    if (bitmap.width <= 1800 && bitmap.height <= 1800 && file.size <= 1024 * 1024) return file;
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Bildbearbeitung wird auf diesem Gerät nicht unterstützt.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of [0.88, 0.72, 0.55]) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (blob && blob.size <= MAX_UPLOAD) break;
    }
    if (!blob || blob.size > MAX_UPLOAD)
      throw new Error(
        "Das Bild ist auch nach dem Verkleinern zu groß. Bitte wähle ein kleineres Bild.",
      );
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
