import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { HttpError } from "@/platform/http";
const mocks = vi.hoisted(() => ({ context: vi.fn(), file: vi.fn() }));
vi.mock("@/platform/context", () => ({ requireContext: mocks.context }));
vi.mock("@/modules/files/service", () => ({ getFile: mocks.file, deleteFile: vi.fn() }));
import { GET } from "@/app/api/files/[id]/route";

const params = { params: Promise.resolve({ id: "photo" }) };
it("sends a small private preview and leaves the original at full resolution", async () => {
  const bytes = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#8c3727" },
  })
    .png()
    .toBuffer();
  mocks.context.mockResolvedValue({ departmentId: "theatre" });
  mocks.file.mockImplementation(async () => ({
    row: { data: { name: "Probe.png", mime: "image/png" } },
    blob: { stream: new Response(new Uint8Array(bytes)).body },
  }));
  const preview = await GET(
    new Request("https://example.test/api/files/photo?preview=thumbnail"),
    params,
  );
  // Immutable per id, but only in the viewer's own browser cache.
  expect(preview.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
  expect(await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).toMatchObject({
    format: "webp",
    width: 320,
    height: 240,
  });
  const original = await GET(new Request("https://example.test/api/files/photo"), params);
  expect(original.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
  expect(Buffer.from(await original.arrayBuffer())).toEqual(bytes);
});

it("uses the original file permissions for thumbnails", async () => {
  mocks.file.mockRejectedValueOnce(new HttpError(403, "Kein Zugriff"));
  const response = await GET(
    new Request("https://example.test/api/files/photo?preview=thumbnail"),
    params,
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
