import { AppShell } from "@/components/app-shell";

/**
 * Same chrome as the rest of the app so Settings reads as a destination rather
 * than a detached admin screen: header, footer nav (which links back here), and
 * the token-revoked banner if the grant has gone.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
