import { Resend } from "resend";
import { isFeatureEnabled } from "@/lib/feature-flags";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

/** False while emails are only logged as suppressed, so callers can tell "sent" from "skipped". */
export function isEmailDeliveryConfigured(): boolean {
  return isFeatureEnabled("email_password_reset") && Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, subject, html }: EmailPayload): Promise<void> {
  if (isEmailDeliveryConfigured()) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) throw new Error("Email delivery failed");
    return;
  }

  // Fallback: record only that a reset email was suppressed during development.
  console.log("[email-stub] Password reset email suppressed");
}
