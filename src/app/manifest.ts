import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DigitalMask · Stadttheater Ingolstadt",
    short_name: "DigitalMask",
    description: "Dein Arbeitsraum hinter der Bühne",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5ef",
    theme_color: "#16735c",
    lang: "de",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
