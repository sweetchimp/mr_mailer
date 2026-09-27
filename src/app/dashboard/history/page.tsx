import { requireUser } from "@/lib/current-session.server";
import { getHistoryEmails } from "@/services/dashboard.server";
import { BucketShell } from "@/components/bucket-shell";
import { HistoryList } from "@/components/email-list";

export default async function HistoryPage() {
  const user = await requireUser();
  const emails = await getHistoryEmails(user.id, "history");

  return (
    <BucketShell bucket="history" count={emails.length}>
      <HistoryList emails={emails} searchable />
    </BucketShell>
  );
}
