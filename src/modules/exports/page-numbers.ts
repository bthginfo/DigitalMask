/** Stamp after pagination so totals are exact even for long notes and images. */
export async function addPageNumbers(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const document = await PDFDocument.load(bytes);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  pages.forEach((page, i) => {
    const text = `Seite ${i + 1} von ${pages.length}`;
    page.drawText(text, {
      x: page.getWidth() - 32 - font.widthOfTextAtSize(text, 8),
      y: 27,
      font,
      size: 8,
      color: rgb(0.325, 0.392, 0.369),
    });
  });
  return document.save();
}
