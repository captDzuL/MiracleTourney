import { isFeatureEnabled } from "@/lib/feature-flags";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailPayload): Promise<void> {
  if (isFeatureEnabled("email_password_reset") && process.env.RESEND_API_KEY) {
    // When email_password_reset feature flag is enabled and RESEND_API_KEY is set,
    // plug in Resend (or another provider) here.
    throw new Error(
      "Email provider is feature-flagged on but no integration is wired yet. Configure RESEND_API_KEY and implement the API call.",
    );
  }

  // Fallback: log to console so reset flow is not broken during development
  console.log(`[email-stub] To: ${to}`);
  console.log(`[email-stub] Subject: ${subject}`);
  console.log(`[email-stub] Body: ${html}`);
}
