import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
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
      className={`${inter.variable} ${plexMono.variable} h-full antialiased`}
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
