import { describe, expect, it } from "vitest";

import { buildCompletionEmail } from "./completion-email";

const deadline = new Date("2026-10-18T05:00:00.000Z");

describe("buildCompletionEmail", () => {
  it("lists only what is missing", () => {
    const email = buildCompletionEmail({
      teamName: "Alpha",
      eventName: "Miracle Open",
      gaps: { missingContact: true, missingPlayers: 0 },
      deadline,
      dashboardUrl: "https://example.test/id/captain",
    });
    expect(email.html).toContain("Nomor WhatsApp kapten belum diisi.");
    expect(email.html).not.toContain("Pemain kurang");
  });

  it("states how many players are missing", () => {
    const email = buildCompletionEmail({
      teamName: "Alpha",
      eventName: "Miracle Open",
      gaps: { missingContact: false, missingPlayers: 2 },
      deadline,
      dashboardUrl: "https://example.test/id/captain",
    });
    expect(email.html).toContain("Pemain kurang 2 orang.");
    expect(email.html).not.toContain("WhatsApp");
  });

  it("shows the deadline in Jakarta time and links to the dashboard", () => {
    const email = buildCompletionEmail({
      teamName: "Alpha",
      eventName: "Miracle Open",
      gaps: { missingContact: true, missingPlayers: 1 },
      deadline,
      dashboardUrl: "https://example.test/id/captain",
    });
    expect(email.subject).toContain("Alpha");
    expect(email.subject).toMatch(/18 Oktober 2026/);
    expect(email.html).toContain("12.00");
    expect(email.html).toContain('href="https://example.test/id/captain"');
  });

  it("escapes team and event names", () => {
    const email = buildCompletionEmail({
      teamName: '<script>alert("x")</script>',
      eventName: "A & B",
      gaps: { missingContact: true, missingPlayers: 0 },
      deadline,
      dashboardUrl: "https://example.test/id/captain",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("A &amp; B");
  });
});
