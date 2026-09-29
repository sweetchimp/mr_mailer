import { AppShell } from "@/components/app-shell";

export default function MinutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
