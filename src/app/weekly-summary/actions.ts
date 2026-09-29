"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma.server";
import { requireUser } from "@/lib/current-session.server";

export interface OptInResult {
  ok: boolean;
  error?: string;
}

/**
 * Turns the Sunday summary email on or off.
 *
 * Coerced to a strict boolean because this is a public server action: anything
 * that is not exactly `true` turns it off, so a malformed payload cannot be used
 * to leave a user opted in against their wishes.
 */
export async function setWeeklyDigestEmailAction(
  enabled: unknown,
): Promise<OptInResult> {
  const user = await requireUser();
  const value = enabled === true;

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { weeklyDigestEmail: value },
    });

    revalidatePath("/weekly-summary");
    return { ok: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return { ok: false, error: errorMessage };
  }
}
