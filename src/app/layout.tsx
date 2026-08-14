import type { Metadata } from "next";
import { Archivo, Figtree } from "next/font/google";
import "./globals.css";

import { SiteHeader } from "@/components/site-header";

/**
 * The design system's pair, declared here because that is where next/font has
 * to be called. Archivo carries every heading and everything that reads as a
 * control; Figtree is the body face and the app's `font-sans`.
 *
 * Archivo is cut to the four weights anything actually sets - the landing
 * headline is what needs the extra-bold, and shipping the other five weights
 * to serve one page would be five files nobody reads.
 *
 * Geist, which used to be both faces, is gone rather than left declared: an
 * unused next/font call still emits a stylesheet and a preload.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NTU Room Finder",
  description:
    "Describe the room you want in plain English and get AI-ranked matches near NTU, Singapore.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line mt-16">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-ink-faint sm:px-6">
            NTU Room Finder is a student project. Listings are posted by users
            and are not verified, endorsed by, or affiliated with NTU.
          </div>
        </footer>
      </body>
    </html>
  );
}
