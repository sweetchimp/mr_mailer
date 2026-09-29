import { AppShell } from "@/components/app-shell";
import { ActivityTickerBar } from "@/components/activity-ticker-bar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell ticker={<ActivityTickerBar />}>{children}</AppShell>;
}
