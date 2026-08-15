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

/**
 * The icon is the hive mark in two colourways - black for a light browser
 * theme, white for a dark one - and every file under `public/icons` is named
 * for the theme it is *shown in*, not for the colour of its ink. The set the
 * generator produced is named the other way round, so a file called
 * `icons/dark/...` is the white artwork.
 *
 * `icon.svg` is what nearly everyone gets: one file carrying both colours in a
 * `prefers-color-scheme` rule, which browsers re-evaluate when the OS theme
 * flips, so the tab updates without a reload. The PNG pair behind it exists
 * for browsers that have dark mode but no SVG favicon support (Safari 16 and
 * older); both members carry an explicit `media`, and the light one is
 * declared last so a browser that ignores `media` altogether falls back to the
 * black artwork rather than the white.
 *
 * These are declared here rather than as `app/icon.svg` and friends because
 * the file convention cannot express a `media` attribute. Nothing icon-shaped
 * should go back into `src/app/` - a `favicon.ico` there would win the
 * `/favicon.ico` route and quietly re-add its own link tag alongside these.
 */
export const metadata: Metadata = {
  title: "NTU Room Finder",
  description:
    "Describe the room you want in plain English and get AI-ranked matches near NTU, Singapore.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      {
        url: "/icons/dark/favicon-32x32.png",
        type: "image/png",
        sizes: "32x32",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icons/dark/favicon-16x16.png",
        type: "image/png",
        sizes: "16x16",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icons/light/favicon-32x32.png",
        type: "image/png",
        sizes: "32x32",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icons/light/favicon-16x16.png",
        type: "image/png",
        sizes: "16x16",
        media: "(prefers-color-scheme: light)",
      },
    ],
    // Flattened onto the canvas sand, because iOS composites a transparent
    // home-screen icon onto black and the artwork here is black.
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
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
