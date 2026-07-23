import { validateSession } from "../lib/session.server";
import { getEmailProvider } from "../services/email-provider.server";
import { prisma } from "../lib/prisma.server";
import { storeReplyFeedback } from "../services/reply-feedback.server";

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

  if (intent !== "send") {
    return jsonWithCookie({ success: false, error: "Invalid intent" }, setCookieHeader);
  }

  const replyText = formData.get("replyText") as string;

  if (!replyText) {
    return jsonWithCookie({ success: false, error: "Missing required fields" }, setCookieHeader);
  }

  try {
    const provider = await getEmailProvider(userId);
    await provider.sendReply(userId, params.id, replyText);

    const summary = await prisma.emailSummary.findUnique({
      where: { gmailMessageId: params.id },
      select: { suggestedReply: true },
    });

    if (summary?.suggestedReply) {
      await storeReplyFeedback({
        emailId: params.id,
        userId,
        generatedReply: summary.suggestedReply,
        finalReply: replyText,
      }).catch((err) => {
        console.error("Failed to store reply feedback:", err);
      });
    }

    return jsonWithCookie({ success: true }, setCookieHeader);
  } catch (error) {
    console.error("Send reply failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonWithCookie({ success: false, error: message }, setCookieHeader);
  }
}
