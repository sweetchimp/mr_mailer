import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are vendored in this repo rather than pulled from `next/font/google`.
// The Google loader downloads from fonts.gstatic.com at build time, which made
// `docker build` depend on live egress to Google; a hermetic image build is
// worth the directory of OFL-licensed .woff2 files sitting next to this file.
const inter = localFont({
  variable: "--font-inter",
  src: "./fonts/inter-latin-wght-normal.woff2",
  display: "swap",
});

// Headings, the greeting, and large numerals. Vendored from the same
// @fontsource variable package as Inter, matching the wght-axis file it ships.
const sourceSerif = localFont({
  variable: "--font-serif",
  src: "./fonts/source-serif-4-latin-wght-normal.woff2",
  display: "swap",
});

const plexMono = localFont({
  variable: "--font-plex-mono",
  src: [
    {
      path: "./fonts/ibm-plex-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mr Mailer",
  description:
    "Mr Mailer turns your inbox into a clear plan — surfacing what needs a reply, what's worth a glance, and what's just FYI.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: "/favicon-32.png",
  },
};

/**
 * Runs before first paint to apply the persisted theme. Without it nothing ever
 * sets `data-theme` on <html>, so the dark-mode blocks in globals.css never
 * match and the theme switcher has nothing to read back.
 *
 * Must stay in sync with THEME_KEY in src/components/theme-switcher.tsx.
 */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("mr-mailer-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plexMono.variable} ${sourceSerif.variable} h-full antialiased`}
      // The theme script below sets data-theme before React hydrates, so this
      // element always carries an attribute the server HTML did not have.
      // Suppress the check rather than patch — patching would fight the script.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
