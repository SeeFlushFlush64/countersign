import type { Metadata } from "next";
import { Caveat, IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Handwriting face for typed signatures (rendered to an image before
// signing). Not preloaded: only the signing screens use it.
const signatureFace = Caveat({
  variable: "--font-signature",
  subsets: ["latin"],
  weight: ["600"],
  preload: false,
});

// Display face for page titles: the serif of the Plex family, which keeps the
// look of business forms and ledgers.
const ibmPlexSerif = IBM_Plex_Serif({
  variable: "--font-ibm-plex-serif",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Countersign: ordered two-party signing",
  description:
    "Two-party agreements with a fixed signing order: the counterparty signs first, then the company countersigns. Enforced on the server and in the database.",
  // A shared sample workspace with published accounts: kept out of search engines
  // everywhere (also the X-Robots-Tag header in next.config.ts and robots.txt).
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${ibmPlexSerif.variable} ${signatureFace.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-fg">
        {children}
      </body>
    </html>
  );
}
