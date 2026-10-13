import { describe, expect, it } from "vitest";

import { soloSlotOpenEmail } from "./solo-slot-open";

const base = {
  playerName: "Bima Kartika",
  eventName: "Flashpeak Solo Cup",
  eventUrl: "https://miracle.example/id/events/solo-cup/register",
};

describe("soloSlotOpenEmail", () => {
  it("tells a player who must pay when the deadline is, in Jakarta time", () => {
    const email = soloSlotOpenEmail({ ...base, status: "pending_payment", deadline: new Date("2026-10-14T03:30:00Z") });
    expect(email.subject).toBe("Slot kamu terbuka: Flashpeak Solo Cup");
    expect(email.html).toContain("Halo Bima Kartika");
    expect(email.html).toContain("Flashpeak Solo Cup");
    expect(email.html).toContain("14 Oktober 2026");
    expect(email.html).toContain("10.30 WIB");
    expect(email.html).toContain(`href="${base.eventUrl}"`);
  });

  it("says plainly that the slot goes to the next player after the deadline", () => {
    const email = soloSlotOpenEmail({ ...base, status: "pending_payment", deadline: new Date("2026-10-14T03:30:00Z") });
    expect(email.html).toMatch(/pemain berikutnya/);
  });

  it("confirms a free registration without asking for payment", () => {
    const email = soloSlotOpenEmail({ ...base, status: "approved", deadline: null });
    expect(email.subject).toBe("Kamu masuk: Flashpeak Solo Cup");
    expect(email.html).not.toMatch(/bayar/i);
    expect(email.html).toContain(`href="${base.eventUrl}"`);
  });

  it("escapes names so a player cannot inject markup into the mail", () => {
    const email = soloSlotOpenEmail({
      playerName: '<script>alert("x")</script>',
      eventName: 'Cup "<b>big</b>" & more',
      eventUrl: base.eventUrl,
      status: "approved",
      deadline: null,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>big</b>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("&amp; more");
    expect(email.subject).not.toContain("<");
  });

  it("refuses a link that is not http or https", () => {
    expect(() => soloSlotOpenEmail({ ...base, eventUrl: "javascript:alert(1)", status: "approved", deadline: null })).toThrow(/url/i);
  });

  it("does not need a deadline for a payment that has none to show", () => {
    expect(() => soloSlotOpenEmail({ ...base, status: "pending_payment", deadline: null })).toThrow(/deadline/i);
  });
});
