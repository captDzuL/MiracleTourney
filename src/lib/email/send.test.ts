import { afterEach, describe, expect, it, vi } from "vitest";

const resendSend = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: resendSend },
  })),
}));

import { sendEmail } from "./send";

const OWNED_ENV_KEYS = ["FEATURE_FLAG_EMAIL_PASSWORD_RESET", "RESEND_API_KEY", "RESEND_FROM_EMAIL"] as const;

afterEach(() => {
  for (const key of OWNED_ENV_KEYS) delete process.env[key];
  resendSend.mockReset();
});

describe("sendEmail", () => {
  it("sends via Resend when the flag is on and an API key is set", async () => {
    process.env.FEATURE_FLAG_EMAIL_PASSWORD_RESET = "true";
    process.env.RESEND_API_KEY = "test-key";
    resendSend.mockResolvedValue({ data: { id: "abc" }, error: null });

    await sendEmail({ to: "user@example.com", subject: "Reset", html: "<p>link</p>" });

    expect(resendSend).toHaveBeenCalledWith({
      from: "onboarding@resend.dev",
      to: "user@example.com",
      subject: "Reset",
      html: "<p>link</p>",
    });
  });

  it("logs and swallows Resend errors instead of throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.FEATURE_FLAG_EMAIL_PASSWORD_RESET = "true";
    process.env.RESEND_API_KEY = "test-key";
    const resendError = { message: "invalid from address" };
    resendSend.mockResolvedValue({ data: null, error: resendError });

    await expect(
      sendEmail({ to: "user@example.com", subject: "Reset", html: "<p>link</p>" }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("user@example.com"), resendError);
    errorSpy.mockRestore();
  });

  it("uses RESEND_FROM_EMAIL when set", async () => {
    process.env.FEATURE_FLAG_EMAIL_PASSWORD_RESET = "true";
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "no-reply@miracletourney.com";
    resendSend.mockResolvedValue({ data: { id: "abc" }, error: null });

    await sendEmail({ to: "user@example.com", subject: "Reset", html: "<p>link</p>" });

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "no-reply@miracletourney.com" }),
    );
  });

  it("falls back to the console stub when the flag is off", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.RESEND_API_KEY = "test-key";

    await sendEmail({ to: "user@example.com", subject: "Reset", html: "<p>link</p>" });

    expect(resendSend).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("user@example.com"));
    logSpy.mockRestore();
  });

  it("falls back to the default sender when RESEND_FROM_EMAIL is empty", async () => {
    process.env.FEATURE_FLAG_EMAIL_PASSWORD_RESET = "true";
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "";
    resendSend.mockResolvedValue({ data: { id: "abc" }, error: null });

    await sendEmail({ to: "user@example.com", subject: "Reset", html: "<p>link</p>" });

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "onboarding@resend.dev" }),
    );
  });

  it("falls back to the console stub when RESEND_API_KEY is missing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.FEATURE_FLAG_EMAIL_PASSWORD_RESET = "true";

    await sendEmail({ to: "user@example.com", subject: "Reset", html: "<p>link</p>" });

    expect(resendSend).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("user@example.com"));
    logSpy.mockRestore();
  });
});
