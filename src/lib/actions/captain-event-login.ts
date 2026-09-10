"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn, signOut } from "@/lib/auth/session";
import { prisma } from "@/lib/platform/db";
import { checkRateLimit } from "@/lib/rate-limit";

export type CaptainEventLoginState =
  | { status: "idle" }
  | { status: "error"; code: "invalid" | "wrong_role" | "database" | "rate_limited" };

const loginInputSchema = z.object({
  locale: z.enum(["id", "en"]),
  eventId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

export function buildCaptainEventDestination(locale: "id" | "en", eventId: string) {
  return `/${locale}/captain?tab=registration&eventId=${encodeURIComponent(eventId)}`;
}

export async function captainEventLoginAction(
  _previousState: CaptainEventLoginState,
  formData: FormData,
): Promise<CaptainEventLoginState> {
  const parsed = loginInputSchema.safeParse({
    locale: String(formData.get("locale") ?? ""),
    eventId: String(formData.get("eventId") ?? ""),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { status: "error", code: "invalid" };

  const forwarded = (await headers()).get("x-forwarded-for") ?? "unknown";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`captain-event-login:${ip}`, 10, 60_000)) {
    return { status: "error", code: "rate_limited" };
  }

  try {
    const event = await prisma.event.findFirst({
      where: {
        id: parsed.data.eventId,
        status: { in: ["Published", "Registration Closed"] },
      },
      select: { id: true },
    });
    if (!event) return { status: "error", code: "invalid" };
  } catch {
    return { status: "error", code: "database" };
  }

  let result;
  try {
    result = await signIn(parsed.data.email, parsed.data.password);
  } catch {
    return { status: "error", code: "database" };
  }
  if (!result.ok || !result.user) return { status: "error", code: "invalid" };

  if (result.user.role !== "captain") {
    await signOut();
    return { status: "error", code: "wrong_role" };
  }

  redirect(buildCaptainEventDestination(parsed.data.locale, parsed.data.eventId));
}