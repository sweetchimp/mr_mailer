import { requireUser } from "@/lib/current-session.server";
import { normalizeSearch } from "@/lib/email-view";
import { getHistoryEmails } from "@/services/dashboard.server";
import { BucketShell } from "@/components/bucket-shell";
import { HistoryList } from "@/components/email-list";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = normalizeSearch(params.q);
  const emails = await getHistoryEmails(user.id, "history", query);

  return (
    <BucketShell bucket="history" count={emails.length}>
      <HistoryList emails={emails} searchable query={query ?? ""} />
    </BucketShell>
  );
}
