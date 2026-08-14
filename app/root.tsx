import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";

import { Watermark } from "./components/Watermark";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap",
  },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
];

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("nuvio-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isLanding = location.pathname === "/";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {!isLanding && <Watermark />}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main
      style={{
        paddingTop: "4rem",
        padding: "4rem 1rem 1rem",
        maxWidth: "36rem",
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "2rem",
          fontWeight: 500,
          color: "var(--color-ink)",
        }}
      >
        {message}
      </h1>
      <p style={{ color: "var(--color-ink-soft)", marginTop: "0.5rem" }}>
        {details}
      </p>
      {stack && (
        <pre
          style={{
            marginTop: "1rem",
            padding: "1rem",
            overflowX: "auto",
            fontSize: "0.75rem",
            background: "var(--color-card)",
            border: "1px solid var(--color-line)",
            borderRadius: "8px",
          }}
        >
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
