import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./perf.css";
export const metadata: Metadata = {
  title: "DigitalMask · Stadttheater Ingolstadt",
  description:
    "Der gemeinsame Arbeitsraum für die Maske. Produktionen, Dienste und Zeitbuchungen an einem Ort.",
  applicationName: "DigitalMask",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "DigitalMask", statusBarStyle: "default" },
};
/** Edge-to-edge on notched phones (the layout pads with safe-area insets); browser UI follows the theme. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#171e1b" },
  ],
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('digitalmask-theme')||'system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(e){if((localStorage.getItem('digitalmask-theme')||'system')==='system')document.documentElement.dataset.theme=e.matches?'dark':'light'})}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
