import { Resend } from "resend";
import { isFeatureEnabled } from "@/lib/feature-flags";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailPayload): Promise<void> {
  if (isFeatureEnabled("email_password_reset") && process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      console.error(`[email] Resend failed to send to ${to}:`, error);
    }
    return;
  }

  // Fallback: log to console so reset flow is not broken during development
  console.log(`[email-stub] To: ${to}`);
  console.log(`[email-stub] Subject: ${subject}`);
  console.log(`[email-stub] Body: ${html}`);
}
