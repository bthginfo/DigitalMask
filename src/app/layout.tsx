import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "DigitalMask · Stadttheater Ingolstadt",
  description:
    "Der gemeinsame Arbeitsraum für die Maske. Produktionen, Dienste und Zeitbuchungen an einem Ort.",
  applicationName: "DigitalMask",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "DigitalMask", statusBarStyle: "default" },
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
