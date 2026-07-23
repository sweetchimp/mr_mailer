import { validateSession } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";

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

  if (intent !== "dismiss") {
    return jsonWithCookie({ success: false, error: "Invalid intent" }, setCookieHeader);
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
      data: { status: "DISMISSED" },
    });

    return jsonWithCookie({ success: true }, setCookieHeader);
  } catch (error) {
    console.error("Dismiss failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonWithCookie({ success: false, error: message }, setCookieHeader);
  }
}
