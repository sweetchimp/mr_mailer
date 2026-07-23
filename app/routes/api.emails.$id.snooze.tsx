import { validateSession } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { emailReminderQueue } from "../services/queue.server";

function jsonWithCookie(data: Record<string, unknown>, setCookieHeader: string) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", "Set-Cookie": setCookieHeader },
  });
}

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  const auth = await validateSession(request);
  if ("error" in auth) {
    return jsonWithCookie(
      { success: false, error: auth.error },
      auth.setCookieHeader ?? "",
    );
  }
  const { userId, setCookieHeader } = auth;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cancel") {
    const summary = await prisma.emailSummary.findUnique({
      where: { gmailMessageId: params.id },
    });

    if (!summary || summary.userId !== userId) {
      return jsonWithCookie({ success: false, error: "Summary not found" }, setCookieHeader);
    }

    await prisma.emailSummary.update({
      where: { gmailMessageId: params.id },
      data: { status: "PENDING", snoozedUntil: null },
    });

    try {
      await emailReminderQueue.remove(`snooze-${params.id}`);
    } catch {
      // job may not exist or already completed
    }

    return jsonWithCookie({ success: true }, setCookieHeader);
  }

  if (intent !== "snooze") {
    return jsonWithCookie({ success: false, error: "Invalid intent" }, setCookieHeader);
  }

  const snoozedUntilStr = formData.get("snoozedUntil") as string;
  if (!snoozedUntilStr) {
    return jsonWithCookie({ success: false, error: "Missing snoozedUntil" }, setCookieHeader);
  }

  const snoozedUntil = new Date(snoozedUntilStr);
  const now = Date.now();
  const maxDelay = 30 * 24 * 60 * 60 * 1000;

  if (isNaN(snoozedUntil.getTime()) || snoozedUntil.getTime() <= now || snoozedUntil.getTime() - now > maxDelay) {
    return jsonWithCookie({ success: false, error: "Invalid snooze time" }, setCookieHeader);
  }

  try {
    const summary = await prisma.emailSummary.findUnique({
      where: { gmailMessageId: params.id },
    });

    if (!summary || summary.userId !== userId) {
      return jsonWithCookie({ success: false, error: "Summary not found" }, setCookieHeader);
    }

    await prisma.emailSummary.update({
      where: { gmailMessageId: params.id },
      data: { status: "SNOOZED", snoozedUntil },
    });

    const delay = snoozedUntil.getTime() - now;

    await emailReminderQueue.add(
      `snooze-${params.id}`,
      {
        emailId: params.id,
        userId,
        subject: summary.subject,
        sender: summary.sender,
      },
      {
        delay,
        jobId: `snooze-${params.id}`,
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );

    return jsonWithCookie({ success: true, snoozedUntil: snoozedUntil.toISOString() }, setCookieHeader);
  } catch (error) {
    console.error("Snooze failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonWithCookie({ success: false, error: message }, setCookieHeader);
  }
}
