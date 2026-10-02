const MAX_UPLOAD = 4_000_000;
const MAX_IMAGE_EDGE = 1800;
const MIN_IMAGE_EDGE = 320;
const uploadImageTypes = ["image/jpeg", "image/png", "image/webp"];
export const imageAccept =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

function imageType(file: File) {
  if (file.type.startsWith("image/")) return file.type;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  return extension === "jpg" || extension === "jpeg"
    ? "image/jpeg"
    : ["png", "webp", "heic", "heif"].includes(extension || "")
      ? `image/${extension}`
      : "";
}

interface UploadImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function loadImage(file: File): Promise<UploadImage> {
  // Safari can load some library photos (including HEIC) as an <img> even when
  // createImageBitmap does not support the same source format.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Try the browser's native image loader below.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  const release = () => {
    image.onload = image.onerror = null;
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
  };
  try {
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Das Foto konnte nicht gelesen werden."));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Das Foto ist leer.");
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release };
  } catch (error) {
    release();
    throw error;
  }
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  try {
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  } catch {
    return null;
  }
}

function uploadImage(file: File, blob: Blob) {
  const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/png" ? "png" : "webp";
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "Foto"}.${extension}`, {
    type: blob.type,
    lastModified: file.lastModified,
  });
}

export async function prepareUpload(file: File): Promise<File> {
  const mime = imageType(file);
  if (!mime || mime === "image/gif" || mime === "image/svg+xml") {
    if (file.size > MAX_UPLOAD)
      throw new Error(
        "Dateien dürfen maximal 4 MB groß sein. Bitte verkleinere die Datei vor dem Hochladen.",
      );
    return file;
  }
  let image: UploadImage;
  try {
    image = await loadImage(file);
  } catch {
    if (uploadImageTypes.includes(mime) && file.size <= MAX_UPLOAD)
      return file.type === mime
        ? file
        : new File([file], file.name, { type: mime, lastModified: file.lastModified });
    throw new Error(
      "Das Foto konnte nicht gelesen werden. Bitte lade es erneut aus deiner Mediathek oder als JPEG hoch.",
    );
  }
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (
      uploadImageTypes.includes(mime) &&
      image.width <= MAX_IMAGE_EDGE &&
      image.height <= MAX_IMAGE_EDGE &&
      file.size <= 1024 * 1024
    )
      return file.type === mime
        ? file
        : new File([file], file.name, { type: mime, lastModified: file.lastModified });
    canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Bildbearbeitung wird auf diesem Gerät nicht unterstützt.");
    let type = "image/webp";
    const preserveTransparency = mime === "image/png" || mime === "image/webp";
    const draw = () => {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      if (type === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas!.width, canvas!.height);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image.source, 0, 0, canvas!.width, canvas!.height);
    };
    for (let edge = MAX_IMAGE_EDGE; ; edge = Math.max(MIN_IMAGE_EDGE, Math.floor(edge * 0.75))) {
      const scale = Math.min(1, edge / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      draw();
      for (const quality of [0.88, 0.72, 0.55]) {
        let blob = await canvasBlob(canvas, type, quality);
        // Unsupported canvas encoders silently return PNG. PNG ignores quality;
        // photos need JPEG on those browsers, while transparent images keep PNG.
        if (type === "image/webp" && (!blob || blob.type !== type)) {
          type = preserveTransparency ? "image/png" : "image/jpeg";
          if (type !== "image/png" || blob?.type !== "image/png") {
            draw();
            blob = await canvasBlob(canvas, type, quality);
          }
        }
        if (blob?.type === "image/png") type = "image/png";
        if (
          blob &&
          blob.size > 0 &&
          blob.size <= MAX_UPLOAD &&
          uploadImageTypes.includes(blob.type)
        )
          return uploadImage(file, blob);
        if (type === "image/png") break;
      }
      if (
        edge === MIN_IMAGE_EDGE ||
        (canvas.width <= MIN_IMAGE_EDGE && canvas.height <= MIN_IMAGE_EDGE)
      )
        break;
    }
    throw new Error("Das Foto konnte nicht verarbeitet werden. Bitte versuche den Upload erneut.");
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
    image.release();
  }
}
