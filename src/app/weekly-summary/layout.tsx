import { AppShell } from "@/components/app-shell";

export default function WeeklySummaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
