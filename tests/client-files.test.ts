import { afterEach, describe, expect, it, vi } from "vitest";
import { imageAccept, prepareUpload } from "@/shared/client-files";

const tooLarge = new Blob([new Uint8Array(4_100_000)], { type: "image/png" });
const blob = (type: string) => new Blob(["encoded image"], { type });
const photo = (type = "image/jpeg", name = "IMG_2042.JPG", size = 1_100_000) =>
  new File([new Uint8Array(size)], name, { type, lastModified: 123456 });

function imageBrowser(
  encode: (type: string, width: number, height: number, quality: number) => Blob | null,
  width = 4032,
  height = 3024,
) {
  const close = vi.fn();
  const ctx = { clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((callback: BlobCallback, type: string, quality: number) =>
      callback(encode(type, canvas.width, canvas.height, quality)),
    ),
  };
  const createImageBitmap = vi.fn(async () => ({ width, height, close }));
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
  return { canvas, ctx, close, createImageBitmap };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("photo preparation for upload", () => {
  it("uses JPEG when Safari returns an oversized PNG instead of WebP", async () => {
    const browser = imageBrowser((type) => (type === "image/webp" ? tooLarge : blob(type)));
    const file = photo("image/jpeg", "IMG_2042.JPG", 6_000_000);
    const result = await prepareUpload(file);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_2042.jpg");
    expect(result.size).toBeLessThan(4_000_000);
    expect(result.lastModified).toBe(file.lastModified);
    expect(browser.canvas.toBlob.mock.calls.map((call) => call[1])).toEqual([
      "image/webp",
      "image/jpeg",
    ]);
    expect(browser.ctx.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 1800, 1350);
    expect(browser.close).toHaveBeenCalledOnce();
    expect(browser.canvas.width).toBe(0);
    expect(browser.canvas.height).toBe(0);
  });

  it("uses the actual encoder MIME and extension even if its PNG fits the limit", async () => {
    imageBrowser((type) => blob(type === "image/webp" ? "image/png" : type));
    const result = await prepareUpload(photo());
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toMatch(/\.jpg$/);
  });

  it("preserves PNG transparency and reduces dimensions when quality cannot reduce PNG size", async () => {
    const browser = imageBrowser(
      (_, width) => (width > 1200 ? tooLarge : blob("image/png")),
      1800,
      1800,
    );
    const result = await prepareUpload(photo("image/png", "Makeup.png", 6_000_000));
    expect(result.type).toBe("image/png");
    expect(result.name).toBe("Makeup.png");
    expect(browser.canvas.toBlob.mock.calls.map((call) => call[1])).toEqual([
      "image/webp",
      "image/png",
      "image/png",
    ]);
    expect(browser.ctx.fillRect).not.toHaveBeenCalled();
    expect(browser.ctx.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 1012, 1012);
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("reduces JPEG dimensions if quality changes alone do not bring it under the limit", async () => {
    const browser = imageBrowser((type, width) =>
      type === "image/webp"
        ? tooLarge
        : width > 1400
          ? new Blob([tooLarge], { type })
          : blob("image/jpeg"),
    );
    const result = await prepareUpload(photo());
    expect(result.type).toBe("image/jpeg");
    expect(browser.ctx.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 1350, 1012);
    expect(browser.canvas.toBlob.mock.calls.map((call) => call[2])).toContain(0.55);
  });

  it("keeps native WebP compression on browsers that support it", async () => {
    const browser = imageBrowser((type, _width, _height, quality) =>
      quality > 0.8 ? new Blob([tooLarge], { type }) : blob(type),
    );
    const result = await prepareUpload(photo());
    expect(result.type).toBe("image/webp");
    expect(result.name).toMatch(/\.webp$/);
    expect(browser.canvas.toBlob.mock.calls.map((call) => call[2])).toEqual([0.88, 0.72]);
  });

  it("loads native HEIC with an image element when createImageBitmap cannot decode it", async () => {
    const browser = imageBrowser((type) => blob(type));
    browser.createImageBitmap.mockRejectedValue(new Error("Unsupported bitmap format"));
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const removeAttribute = vi.fn();
    class NativeImage {
      naturalWidth = 1200;
      naturalHeight = 900;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      removeAttribute = removeAttribute;
      set src(_url: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", NativeImage);
    const result = await prepareUpload(photo("image/heic", "IMG_2042.HEIC", 100));
    expect(result.type).toBe("image/webp");
    expect(result.name).toBe("IMG_2042.webp");
    expect(removeAttribute).toHaveBeenCalledWith("src");
    expect(revoke).toHaveBeenCalledOnce();
    expect(browser.close).not.toHaveBeenCalled();
  });

  it("recognizes image file extensions when the photo picker leaves the MIME empty", async () => {
    const browser = imageBrowser((type) => blob(type), 600, 800);
    const result = await prepareUpload(photo("", "portrait.JPEG", 100));
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("portrait.JPEG");
    expect(browser.canvas.toBlob).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(imageAccept).toContain("image/heic");
    expect(imageAccept).toContain(".heif");
  });

  it("does not re-encode already small supported images", async () => {
    const browser = imageBrowser((type) => blob(type), 600, 800);
    const file = photo("image/jpeg", "portrait.jpg", 100);
    expect(await prepareUpload(file)).toBe(file);
    expect(browser.canvas.toBlob).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("releases image and canvas memory after an encoder failure", async () => {
    const browser = imageBrowser(() => null);
    await expect(prepareUpload(photo())).rejects.toThrow(
      "Das Foto konnte nicht verarbeitet werden",
    );
    expect(browser.close).toHaveBeenCalledOnce();
    expect(browser.canvas.width).toBe(0);
    expect(browser.canvas.height).toBe(0);
  });

  it("keeps the existing limit for documents without running image processing", async () => {
    const browser = imageBrowser((type) => blob(type));
    const file = new File(["%PDF-"], "document.pdf", { type: "application/pdf" });
    expect(await prepareUpload(file)).toBe(file);
    await expect(
      prepareUpload(new File([tooLarge], "document.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("maximal 4 MB");
    expect(browser.createImageBitmap).not.toHaveBeenCalled();
  });
});
