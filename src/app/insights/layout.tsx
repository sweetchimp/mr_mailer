import { AppShell } from "@/components/app-shell";

export default function InsightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
